import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegistroDto } from './dto/registro.dto';
import { LoginDto } from './dto/login.dto';
import { Request, Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private get googleConfig() {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ||
        'http://localhost:3001/auth/google/callback',
    };
  }

  private get googleHabilitado() {
    return !!(this.googleConfig.clientId && this.googleConfig.clientSecret);
  }

  @Post('registro')
  registro(@Body() body: RegistroDto) {
    return this.authService.registro(body.nombre, body.email, body.password);
  }

  @Post('login')
  login(@Body() body: LoginDto) {
    return this.authService.login(body.email, body.password);
  }

  @Get('google')
  googleAuth(@Res() res: Response) {
    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
    if (!this.googleHabilitado) {
      return res.redirect(
        `${FRONTEND_URL}/auth?error=${encodeURIComponent('Google OAuth no configurado. Contactá al administrador.')}`,
      );
    }
    const { clientId, callbackURL } = this.googleConfig;
    const googleUrl =
      'https://accounts.google.com/o/oauth2/v2/auth?' +
      new URLSearchParams({
        client_id: clientId!,
        redirect_uri: callbackURL,
        response_type: 'code',
        scope: 'email profile',
      }).toString();
    res.redirect(googleUrl);
  }

  @Get('google/callback')
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
    const code = req.query.code as string;
    if (!code || !this.googleHabilitado) {
      return res.redirect(
        `${FRONTEND_URL}/auth?error=${encodeURIComponent('Google OAuth no configurado. Contactá al administrador.')}`,
      );
    }
    try {
      const { clientId, clientSecret, callbackURL } = this.googleConfig;
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId!,
          client_secret: clientSecret!,
          redirect_uri: callbackURL,
          grant_type: 'authorization_code',
        }).toString(),
      });
      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) {
        console.error('Error en token exchange:', JSON.stringify(tokenData));
        throw new Error(`Error de Google: ${tokenData.error_description || tokenData.error || 'Failed to get access token'}`);
      }
      const userRes = await fetch(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        },
      );
      const googleUser = await userRes.json();

      const result = await this.authService.loginOGoogle(
        googleUser.id,
        googleUser.email,
        googleUser.name,
      );

      res.redirect(
        `${FRONTEND_URL}/auth/google/callback?token=${result.token}&usuario=${encodeURIComponent(JSON.stringify(result.usuario))}`,
      );
    } catch (err) {
      console.error('Error en Google callback:', err);
      const mensaje = err instanceof Error ? err.message : 'Error al autenticar con Google. Intentalo de nuevo.';
      return res.redirect(
        `${FRONTEND_URL}/auth?error=${encodeURIComponent(mensaje)}`,
      );
    }
  }
}
