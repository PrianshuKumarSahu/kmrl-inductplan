from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt
from pydantic import BaseModel
from app.database import get_user_profile
from app.config import get_settings
from typing import Optional

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token", auto_error=False)

class CurrentUser(BaseModel):
    id: str
    email: str = ""
    role: str = "supervisor"
    name: str = "KMRL Staff"

def get_current_user(token: Optional[str] = Depends(oauth2_scheme)) -> CurrentUser:
    settings = get_settings()
    
    # If no token provided
    if not token:
        # In development, provide default supervisor credentials to prevent unnecessary 401s
        if settings.ENVIRONMENT == "development":
            return CurrentUser(
                id="b4689c0e-646f-46a3-95ca-c53f1fce3889",
                email="operations@kmrl.co.in",
                role="supervisor",
                name="KMRL Rolling Stock Controller"
            )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
        
    try:
        payload = jwt.get_unverified_claims(token)
        user_id = payload.get("sub")
        email = payload.get("email", "")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token format")
    
    profile = get_user_profile(user_id, email)
    if not profile or not profile.get("is_active"):
        return CurrentUser(
            id=user_id,
            email=email,
            role="supervisor",
            name=email.split("@")[0] if email else "KMRL Staff"
        )
        
    return CurrentUser(
        id=profile["id"],
        email=email or profile.get("email", ""),
        role=profile.get("role", "supervisor"),
        name=profile.get("name", "KMRL Staff")
    )

def require_supervisor(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role != 'supervisor':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Supervisor role required")
    return user

def require_operator(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role not in ['supervisor', 'operator']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Operator role required")
    return user
