from pydantic import BaseModel, EmailStr

class UserCreate(BaseModel):
  first_name: str
  last_name: str
  email: EmailStr
  password: str

class UserResponse(BaseModel):
  id: int
  first_name: str
  last_name: str
  email: str

  class Config:
    from_attributes=True

class Token(BaseModel):
  access_token: str
  token_type: str

class ProjectCreate(BaseModel):
  name: str
  description: str | None = None

class ChatRequest(BaseModel):
  message: str