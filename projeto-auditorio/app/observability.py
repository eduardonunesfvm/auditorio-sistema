import logging
import os
import threading
from dataclasses import dataclass
from typing import Callable

from fastapi import FastAPI
from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import (
    MetricReader,
    PeriodicExportingMetricReader,
)
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SpanExporter
from sqlalchemy.engine import Engine


logger = logging.getLogger(__name__)

DEFAULT_EXCLUDED_URLS = (
    r"/health$|"
    r"/(?:favicon\.ico|[^?]+\.(?:css|js|png|jpg|jpeg|gif|svg|webp|ico|map))"
    r"(?:\?.*)?$"
)
_SENSITIVE_HTTP_ATTRIBUTES = (
    "client.address",
    "http.client_ip",
    "http.target",
    "http.url",
    "http.user_agent",
    "net.peer.ip",
    "url.full",
    "url.path",
    "url.query",
    "user_agent.original",
)


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().casefold() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class ObservabilitySettings:
    enabled: bool
    service_name: str = "auditorio-api"
    metric_export_interval_millis: int = 60_000
    excluded_urls: str = DEFAULT_EXCLUDED_URLS

    @classmethod
    def from_environment(cls) -> "ObservabilitySettings":
        raw_interval = os.getenv("OTEL_METRIC_EXPORT_INTERVAL", "60000")
        try:
            interval = max(1_000, int(raw_interval))
        except ValueError:
            logger.warning(
                "OTEL_METRIC_EXPORT_INTERVAL invalido; usando 60000 ms."
            )
            interval = 60_000

        return cls(
            enabled=_env_bool("OTEL_ENABLED"),
            service_name=os.getenv("OTEL_SERVICE_NAME", "auditorio-api"),
            metric_export_interval_millis=interval,
            excluded_urls=os.getenv(
                "OTEL_PYTHON_FASTAPI_EXCLUDED_URLS",
                DEFAULT_EXCLUDED_URLS,
            ),
        )


class DomainMetrics:
    """Low-cardinality business counters shared by the service layer."""

    _NAMES = {
        "reservation_created": "auditorio.reservations.created",
        "reservation_updated": "auditorio.reservations.updated",
        "reservation_deleted": "auditorio.reservations.deleted",
        "scheduling_conflict": "auditorio.scheduling.conflicts",
        "invalid_schedule_window": "auditorio.scheduling.invalid_window",
        "auth_rate_limited": "auditorio.auth.rate_limited",
        "auth_rate_limiter_fail_open": "auditorio.auth.rate_limiter_fail_open",
    }

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._counters = {}

    def configure(self, meter_provider: MeterProvider) -> None:
        meter = meter_provider.get_meter("app.domain", "2.0.0")
        counters = {
            key: meter.create_counter(
                name=name,
                description=f"Contador de dominio: {name}",
            )
            for key, name in self._NAMES.items()
        }
        with self._lock:
            self._counters = counters

    def reset(self) -> None:
        with self._lock:
            self._counters = {}

    def _increment(self, key: str) -> None:
        with self._lock:
            counter = self._counters.get(key)
        if counter is not None:
            counter.add(1)

    def reservation_created(self) -> None:
        self._increment("reservation_created")

    def reservation_updated(self) -> None:
        self._increment("reservation_updated")

    def reservation_deleted(self) -> None:
        self._increment("reservation_deleted")

    def scheduling_conflict(self) -> None:
        self._increment("scheduling_conflict")

    def invalid_schedule_window(self) -> None:
        self._increment("invalid_schedule_window")

    def auth_rate_limited(self) -> None:
        self._increment("auth_rate_limited")

    def auth_rate_limiter_fail_open(self) -> None:
        self._increment("auth_rate_limiter_fail_open")


domain_metrics = DomainMetrics()


def _resource(settings: ObservabilitySettings) -> Resource:
    attributes: dict[str, str] = {
        "service.name": settings.service_name,
    }
    railway_attributes = {
        "RAILWAY_ENVIRONMENT_NAME": "deployment.environment.name",
        "RAILWAY_REPLICA_ID": "service.instance.id",
        "RAILWAY_GIT_COMMIT_SHA": "service.version",
        "RAILWAY_DEPLOYMENT_ID": "railway.deployment.id",
        "RAILWAY_SERVICE_NAME": "railway.service.name",
    }
    for environment_name, resource_name in railway_attributes.items():
        value = os.getenv(environment_name)
        if value:
            attributes[resource_name] = value
    return Resource.create(attributes)


def _sanitize_server_span(span, _scope) -> None:
    if not span or not span.is_recording():
        return
    for attribute in _SENSITIVE_HTTP_ATTRIBUTES:
        span.set_attribute(attribute, "[redacted]")


class ObservabilityRuntime:
    def __init__(
        self,
        *,
        enabled: bool,
        app: FastAPI | None = None,
        tracer_provider: TracerProvider | None = None,
        meter_provider: MeterProvider | None = None,
        sqlalchemy_instrumentor: SQLAlchemyInstrumentor | None = None,
    ) -> None:
        self.enabled = enabled
        self.app = app
        self.tracer_provider = tracer_provider
        self.meter_provider = meter_provider
        self.sqlalchemy_instrumentor = sqlalchemy_instrumentor
        self._shutdown = False

    def force_flush(self, timeout_millis: int = 10_000) -> bool:
        if not self.enabled:
            return True
        trace_flushed = self.tracer_provider.force_flush(timeout_millis)
        metrics_flushed = self.meter_provider.force_flush(timeout_millis)
        return trace_flushed and metrics_flushed

    def shutdown(self) -> None:
        if self._shutdown or not self.enabled:
            return
        self._shutdown = True
        domain_metrics.reset()
        try:
            self.force_flush()
        except Exception:
            logger.exception("Falha ao descarregar telemetria antes do encerramento.")
        try:
            if self.app is not None:
                FastAPIInstrumentor.uninstrument_app(self.app)
            if self.sqlalchemy_instrumentor is not None:
                self.sqlalchemy_instrumentor.uninstrument()
        except Exception:
            logger.exception("Falha ao remover instrumentacao OpenTelemetry.")
        try:
            self.tracer_provider.shutdown()
        except Exception:
            logger.exception("Falha ao encerrar o exportador de traces.")
        try:
            self.meter_provider.shutdown()
        except Exception:
            logger.exception("Falha ao encerrar o exportador de metricas.")


def setup_observability(
    app: FastAPI,
    engine: Engine | None,
    *,
    settings: ObservabilitySettings | None = None,
    span_exporter: SpanExporter | None = None,
    metric_reader: MetricReader | None = None,
    span_exporter_factory: Callable[[], SpanExporter] = OTLPSpanExporter,
    metric_exporter_factory: Callable[[], OTLPMetricExporter] = OTLPMetricExporter,
) -> ObservabilityRuntime:
    settings = settings or ObservabilitySettings.from_environment()
    if not settings.enabled:
        return ObservabilityRuntime(enabled=False)

    uses_remote_exporters = span_exporter is None or metric_reader is None
    if uses_remote_exporters and (
        not os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
        or not os.getenv("OTEL_EXPORTER_OTLP_HEADERS")
    ):
        logger.error(
            "OpenTelemetry desativado: endpoint ou cabecalhos OTLP ausentes."
        )
        return ObservabilityRuntime(enabled=False)

    tracer_provider = None
    meter_provider = None
    sqlalchemy_instrumentor = None
    fastapi_instrumented = False
    try:
        os.environ.setdefault("OTEL_SEMCONV_STABILITY_OPT_IN", "http")
        telemetry_resource = _resource(settings)
        span_exporter = span_exporter or span_exporter_factory()
        tracer_provider = TracerProvider(resource=telemetry_resource)
        tracer_provider.add_span_processor(BatchSpanProcessor(span_exporter))

        if metric_reader is None:
            metric_reader = PeriodicExportingMetricReader(
                metric_exporter_factory(),
                export_interval_millis=settings.metric_export_interval_millis,
                export_timeout_millis=10_000,
            )
        meter_provider = MeterProvider(
            resource=telemetry_resource,
            metric_readers=[metric_reader],
        )
        domain_metrics.configure(meter_provider)

        FastAPIInstrumentor.instrument_app(
            app,
            tracer_provider=tracer_provider,
            meter_provider=meter_provider,
            server_request_hook=_sanitize_server_span,
            excluded_urls=settings.excluded_urls,
            http_capture_headers_server_request=[],
            http_capture_headers_server_response=[],
            http_capture_headers_sanitize_fields=[
                "authorization",
                "cookie",
                "set-cookie",
            ],
            exclude_spans=["receive", "send"],
        )
        fastapi_instrumented = True

        if engine is not None:
            sqlalchemy_instrumentor = SQLAlchemyInstrumentor()
            sqlalchemy_instrumentor.instrument(
                engine=engine,
                tracer_provider=tracer_provider,
                meter_provider=meter_provider,
                enable_commenter=False,
                enable_attribute_commenter=False,
            )

        logger.info(
            "OpenTelemetry habilitado para o servico %s.",
            settings.service_name,
        )
        return ObservabilityRuntime(
            enabled=True,
            app=app,
            tracer_provider=tracer_provider,
            meter_provider=meter_provider,
            sqlalchemy_instrumentor=sqlalchemy_instrumentor,
        )
    except Exception:
        domain_metrics.reset()
        if fastapi_instrumented:
            try:
                FastAPIInstrumentor.uninstrument_app(app)
            except Exception:
                logger.exception(
                    "Falha ao remover instrumentacao FastAPI incompleta."
                )
        if sqlalchemy_instrumentor is not None:
            try:
                sqlalchemy_instrumentor.uninstrument()
            except Exception:
                logger.exception(
                    "Falha ao remover instrumentacao SQLAlchemy incompleta."
                )
        if tracer_provider is not None:
            try:
                tracer_provider.shutdown()
            except Exception:
                logger.exception("Falha ao encerrar tracer provider incompleto.")
        if meter_provider is not None:
            try:
                meter_provider.shutdown()
            except Exception:
                logger.exception("Falha ao encerrar meter provider incompleto.")
        logger.exception(
            "Falha ao configurar OpenTelemetry; aplicacao iniciara sem telemetria."
        )
        return ObservabilityRuntime(enabled=False)
