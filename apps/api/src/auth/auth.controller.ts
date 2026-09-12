import { Body, Controller, Get, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { AuthGuard, type AuthenticatedRequest } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";

class SignupDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  fullName!: string;

  @IsEmail()
  @MaxLength(180)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

class LoginDto {
  @IsEmail()
  @MaxLength(180)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  fullName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(180)
  email?: string;
}

class UpdatePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("signup")
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
  }

  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @UseGuards(AuthGuard)
  @Get("me")
  async me(@Req() request: AuthenticatedRequest) {
    return { user: await this.auth.me(request.userId) };
  }

  @UseGuards(AuthGuard)
  @Patch("profile")
  async updateProfile(@Req() request: AuthenticatedRequest, @Body() dto: UpdateProfileDto) {
    return { user: await this.auth.updateProfile(request.userId, dto) };
  }

  @UseGuards(AuthGuard)
  @Patch("password")
  updatePassword(@Req() request: AuthenticatedRequest, @Body() dto: UpdatePasswordDto) {
    return this.auth.updatePassword(request.userId, dto);
  }
}
