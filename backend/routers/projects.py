from fastapi import APIRouter, Depends
from schemas import ProjectCreate
from dependencies import get_db, get_current_user
from sqlalchemy.orm import Session
import models

router = APIRouter(
  prefix="/projects",
  tags=["Projects"]
)

@router.post("/")
def create_project(
  project_data: ProjectCreate,
  current_user: models.User=Depends(get_current_user),
  db: Session=Depends(get_db)
):
  new_project=models.Project(
    name=project_data.name,
    description=project_data.description,
    owner_id=current_user.id
  )

  db.add(new_project)
  db.commit()
  db.refresh(new_project)

  return {
    "message": "Project created successfully!",
    "project_id": new_project.id,
    "owner": current_user.email
  }