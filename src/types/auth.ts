export interface LoginRequest {
  email: string;
  password: string;
  is_running_on_mobile: boolean;
  is_remember: boolean;
  mobile_device_name: string | null;
}

export interface Role {
  id: string;
  name: string;
  editable: boolean;
}

export interface LoginResponse {
  id: string;
  name: string;
  email: string;
  token_expire_time: string | null;
  token: string;
  refresh_token: string;
  role: Role;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ConfirmForgotPasswordRequest {
  email: string;
  otp: string;
  password: string;
}

export interface ApiError {
  detail: string;
}
