from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from ..database import get_db

router = APIRouter(prefix="/auth", tags=["Autenticação"])
