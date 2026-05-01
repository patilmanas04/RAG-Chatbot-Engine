from sqlalchemy import Column, Integer, String, Text, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class User(Base):
  __tablename__="users"

  # Columns
  id=Column(Integer, primary_key=True, index=True)
  email=Column(String(255), unique=True, index=True)
  password=Column(String(255))
  is_active=Column(Boolean, default=True)
  created_at=Column(DateTime(timezone=True), server_default=func.now())

  # Table Join with "projects" table
  projects=relationship("Project", back_populates="owner")

class Project(Base):
  __tablename__="projects"

  # Columns
  id=Column(Integer, primary_key=True, index=True)
  name=Column(String(255), index=True)
  description=Column(Text)
  created_at=Column(DateTime(timezone=True), server_default=func.now())

  # Foreign Key
  owner_id=Column(Integer, ForeignKey("users.id"))

  # Table Join with "users" table
  owner=relationship("User", back_populates="projects")