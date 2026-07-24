from fastapi import APIRouter, Depends, status
from fastapi.responses import Response
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List

from ..database import get_db
from ..dependencies import obter_usuario_atual, check_ci_access
from ..models import Usuario
from ..schemas import ComunicacaoInternaCreate, ComunicacaoInternaResponse, ComunicacaoInternaUpdate
from ..repository import ComunicacaoInternaRepository
from ..service import ComunicacaoInternaService

router = APIRouter(prefix="/api/v1/ci", tags=["Comunicacao Interna"])


@router.post("")
def criar_ci(
    payload: ComunicacaoInternaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(check_ci_access),
):
    repo = ComunicacaoInternaRepository(db)
    service = ComunicacaoInternaService(repo)
    pdf_bytes = service.criar_e_gerar_pdf(payload, current_user)

    filename = f"CI_{payload.titulo[:30]}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
    )


@router.get("", response_model=List[ComunicacaoInternaResponse])
def listar_cis(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(obter_usuario_atual),
):
    repo = ComunicacaoInternaRepository(db)
    service = ComunicacaoInternaService(repo)
    return service.listar_cis(current_user)


@router.get("/{ci_id}/pdf")
def baixar_ci_pdf(
    ci_id: UUID,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(obter_usuario_atual),
):
    repo = ComunicacaoInternaRepository(db)
    service = ComunicacaoInternaService(repo)
    pdf_bytes = service.gerar_pdf_por_id(ci_id)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=CI_{ci_id}.pdf"},
    )


@router.put("/{ci_id}")
def atualizar_ci(
    ci_id: UUID,
    payload: ComunicacaoInternaUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(check_ci_access),
):
    repo = ComunicacaoInternaRepository(db)
    service = ComunicacaoInternaService(repo)
    pdf_bytes = service.atualizar_ci(ci_id, payload, current_user)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=CI_{ci_id}.pdf"},
    )
