from contextlib import contextmanager

from fastapi import FastAPI
from fastapi.testclient import TestClient
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import InMemoryMetricReader
from opentelemetry.sdk.trace.export import SpanExportResult, SpanExporter
from opentelemetry.sdk.trace.export.in_memory_span_exporter import (
    InMemorySpanExporter,
)
from sqlalchemy import create_engine, text
from sqlalchemy.pool import StaticPool

from app.observability import (
    ObservabilitySettings,
    _resource,
    domain_metrics,
    setup_observability,
)


def _metric_points(reader: InMemoryMetricReader) -> dict[str, list]:
    result = {}
    metrics_data = reader.get_metrics_data()
    for resource_metrics in metrics_data.resource_metrics:
        for scope_metrics in resource_metrics.scope_metrics:
            for metric in scope_metrics.metrics:
                result[metric.name] = list(metric.data.data_points)
    return result


@contextmanager
def _instrumented_app(span_exporter=None):
    app = FastAPI()
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @app.get("/items/{item_id}")
    def read_item(item_id: int):
        with engine.connect() as connection:
            connection.execute(
                text("SELECT :sensitive_value"),
                {"sensitive_value": "segredo-sql-nao-exportar"},
            ).scalar_one()
        domain_metrics.reservation_created()
        return {"item_id": item_id}

    @app.get("/health")
    def health():
        return {"status": "healthy"}

    @app.get("/styles.css")
    def stylesheet():
        return "body {}"

    metric_reader = InMemoryMetricReader()
    runtime = setup_observability(
        app,
        engine,
        settings=ObservabilitySettings(enabled=True),
        span_exporter=span_exporter or InMemorySpanExporter(),
        metric_reader=metric_reader,
    )
    try:
        yield app, runtime, metric_reader
    finally:
        runtime.shutdown()
        engine.dispose()


def test_disabled_observability_does_not_build_exporters(monkeypatch):
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_HEADERS", raising=False)

    def unexpected_exporter():
        raise AssertionError("Exporter nao deveria ser criado")

    runtime = setup_observability(
        FastAPI(),
        None,
        settings=ObservabilitySettings(enabled=False),
        span_exporter_factory=unexpected_exporter,
        metric_exporter_factory=unexpected_exporter,
    )

    assert runtime.enabled is False
    assert runtime.force_flush()


def test_enabled_observability_without_credentials_fails_open(monkeypatch):
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_HEADERS", raising=False)
    app = FastAPI()

    @app.get("/ready")
    def ready():
        return {"ready": True}

    runtime = setup_observability(
        app,
        None,
        settings=ObservabilitySettings(enabled=True),
    )

    assert runtime.enabled is False
    assert TestClient(app).get("/ready").status_code == 200


def test_exporter_initialization_failure_fails_open(monkeypatch):
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "https://example.invalid/otlp")
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_HEADERS", "Authorization=Basic%20test")
    app = FastAPI()

    @app.get("/ready")
    def ready():
        return {"ready": True}

    def failing_exporter():
        raise RuntimeError("exporter indisponivel")

    runtime = setup_observability(
        app,
        None,
        settings=ObservabilitySettings(enabled=True),
        span_exporter_factory=failing_exporter,
    )

    assert runtime.enabled is False
    assert TestClient(app).get("/ready").status_code == 200


def test_http_and_sql_spans_exclude_health_static_and_secrets():
    span_exporter = InMemorySpanExporter()
    with _instrumented_app(span_exporter) as (app, runtime, metric_reader):
        client = TestClient(app)
        response = client.get(
            "/items/987654321",
            headers={
                "Authorization": "Bearer jwt-super-secreto",
                "Cookie": "session=segredo-cookie",
            },
        )
        assert response.status_code == 200
        assert client.get("/health").status_code == 200
        assert client.get("/styles.css").status_code == 200
        assert runtime.force_flush()

        spans = span_exporter.get_finished_spans()
        span_names = {span.name for span in spans}
        assert "GET /items/{item_id}" in span_names
        assert all("health" not in name for name in span_names)
        assert all("styles.css" not in name for name in span_names)
        assert any(
            span.attributes.get("db.system.name") == "sqlite"
            or span.attributes.get("db.system") == "sqlite"
            for span in spans
        )

        exported_text = " ".join(
            str(value)
            for span in spans
            for value in span.attributes.values()
        )
        assert "jwt-super-secreto" not in exported_text
        assert "segredo-cookie" not in exported_text
        assert "segredo-sql-nao-exportar" not in exported_text
        assert "987654321" not in exported_text

        points = _metric_points(metric_reader)
        assert "auditorio.reservations.created" in points
        assert sum(point.value for point in points["auditorio.reservations.created"]) == 1
        assert "http.server.request.duration" in points
        http_attributes = [
            dict(point.attributes)
            for point in points["http.server.request.duration"]
        ]
        assert any(
            attributes.get("http.route") == "/items/{item_id}"
            and attributes.get("http.response.status_code") == 200
            for attributes in http_attributes
        )
        assert all("http.target" not in attributes for attributes in http_attributes)


def test_domain_counters_have_no_high_cardinality_attributes():
    reader = InMemoryMetricReader()
    provider = MeterProvider(metric_readers=[reader])
    domain_metrics.configure(provider)
    try:
        domain_metrics.reservation_created()
        domain_metrics.reservation_updated()
        domain_metrics.reservation_deleted()
        domain_metrics.scheduling_conflict()
        domain_metrics.invalid_schedule_window()
        domain_metrics.auth_rate_limited()
        domain_metrics.auth_rate_limiter_fail_open()
        assert provider.force_flush()

        points = _metric_points(reader)
        expected = {
            "auditorio.reservations.created",
            "auditorio.reservations.updated",
            "auditorio.reservations.deleted",
            "auditorio.scheduling.conflicts",
            "auditorio.scheduling.invalid_window",
            "auditorio.auth.rate_limited",
            "auditorio.auth.rate_limiter_fail_open",
        }
        assert expected <= points.keys()
        for name in expected:
            assert sum(point.value for point in points[name]) == 1
            assert all(not point.attributes for point in points[name])
    finally:
        domain_metrics.reset()
        provider.shutdown()


class FailingSpanExporter(SpanExporter):
    def export(self, spans):
        return SpanExportResult.FAILURE

    def shutdown(self):
        return None


def test_exporter_failure_does_not_fail_request():
    with _instrumented_app(FailingSpanExporter()) as (app, runtime, _reader):
        response = TestClient(app).get("/items/42")
        assert response.status_code == 200
        assert response.json() == {"item_id": 42}
        runtime.force_flush()


def test_railway_metadata_is_added_without_credentials(monkeypatch):
    monkeypatch.setenv("OTEL_RESOURCE_ATTRIBUTES", "service.namespace=auditorio")
    monkeypatch.setenv("RAILWAY_ENVIRONMENT_NAME", "production")
    monkeypatch.setenv("RAILWAY_REPLICA_ID", "replica-1")
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", "abc123")
    monkeypatch.setenv("RAILWAY_DEPLOYMENT_ID", "deployment-1")
    monkeypatch.setenv("RAILWAY_SERVICE_NAME", "auditorio")
    resource = _resource(ObservabilitySettings(enabled=True))

    assert resource.attributes["service.name"] == "auditorio-api"
    assert resource.attributes["service.namespace"] == "auditorio"
    assert resource.attributes["deployment.environment.name"] == "production"
    assert resource.attributes["service.instance.id"] == "replica-1"
    assert resource.attributes["service.version"] == "abc123"
    assert resource.attributes["railway.deployment.id"] == "deployment-1"
    assert resource.attributes["railway.service.name"] == "auditorio"
    assert all("secret" not in key.casefold() for key in resource.attributes)
