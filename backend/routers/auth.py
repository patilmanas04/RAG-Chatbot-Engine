from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from dependencies import get_db, get_current_user
from datetime import datetime, timedelta, timezone
import bcrypt, models, schemas, jwt, os
from dotenv import load_dotenv

load_dotenv()

router=APIRouter(tags=["Authentication"])

# Credentials for creating JWT token
SECRET_KEY=os.getenv("SECRET_KEY")
ALGORITHM=os.getenv("ALGORITHM")
ACCESS_TOKEN_EXPIRE_MINUTES=int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES"))

# --- HELPER FUNCTIONS ---
def get_hash_password(password: str) -> str:
  password_bytes=password.encode('utf-8')
  salt=bcrypt.gensalt()
  hashed_password=bcrypt.hashpw(password_bytes, salt)
  return hashed_password.decode('utf-8')

def verify_hashed_password(password: str, hashed_password: str) -> bool:
  password_bytes=password.encode('utf-8')
  hashed_password_bytes=hashed_password.encode('utf-8')

  return bcrypt.checkpw(password_bytes, hashed_password_bytes)

def get_access_token(data: dict) -> str:
  to_encode=data.copy()
  expries=datetime.now(timezone.utc)+timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
  to_encode.update({"exp":expries})
  return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# --- ROUTES ---

# 1. Register a new user
@router.post("/register", status_code=status.HTTP_201_CREATED)
def register_user(user: schemas.UserCreate, db: Session=Depends(get_db)):
  # Check if the user already exists in the TiDB
  existing_user=db.query(models.User.id).filter(models.User.email==user.email).first()
  if existing_user:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="The email address already exists."
    )
  
  hashed_password=get_hash_password(user.password)
  new_user=models.User(
    first_name=user.first_name,
    last_name=user.last_name,
    email=user.email,
    password=hashed_password
  )

  db.add(new_user)
  db.commit()
  db.refresh(new_user)

  return {
    "message": "User created successfully!",
    "user_id": new_user.id
  }

# 2. User login and generation of access token which is sent back to the browser
@router.post("/login", response_model=schemas.Token)
def login(form_data:OAuth2PasswordRequestForm=Depends(), db:Session=Depends(get_db)):
  user=db.query(models.User).filter(models.User.email==form_data.username).first()

  if not user or not verify_hashed_password(form_data.password, user.password):
    raise HTTPException(
      status_code=status.HTTP_401_UNAUTHORIZED,
      detail="Incorrect email or password",
      headers={"WWW-Authenticate": "Bearer"}
    )
  
  access_token=get_access_token({"sub": str(user.id)})

  return {"access_token": access_token, "token_type": "bearer"}

@router.get("/users/me", response_model=schemas.UserResponse)
def read_users_me(
  current_user: models.User=Depends(get_current_user)
):
  return current_user