import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsuariosService } from '../usuarios/usuarios.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private usuariosService: UsuariosService,
    private jwtService: JwtService,
  ) {}

  async registro(nombre: string, email: string, password: string) {
    const existe = await this.usuariosService.findByEmail(email);
    if (existe) throw new BadRequestException('El email ya está registrado');

    const hash = await bcrypt.hash(password, 10);
    const usuario = await this.usuariosService.crear({
      nombre,
      email,
      password_hash: hash,
    });

    const token = this.jwtService.sign({ id: usuario.id, rol: usuario.rol });
    return {
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
      },
    };
  }

  async loginOGoogle(googleId: string, email: string, nombre: string) {
    let usuario = await this.usuariosService.findByEmail(email);
    if (usuario) {
      if (!usuario.google_id) {
        await this.usuariosService.actualizar(usuario.id, {
          google_id: googleId,
        });
      }
    } else {
      usuario = await this.usuariosService.crear({
        nombre,
        email,
        google_id: googleId,
        password_hash: '',
      });
    }

    const token = this.jwtService.sign({ id: usuario.id, rol: usuario.rol });
    return {
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
      },
    };
  }

  async login(email: string, password: string) {
    const usuario = await this.usuariosService.findByEmail(email);
    if (!usuario) throw new UnauthorizedException('Credenciales incorrectas');
    if (!usuario.password_hash)
      throw new UnauthorizedException('Credenciales incorrectas');

    const valido = await bcrypt.compare(password, usuario.password_hash);
    if (!valido) throw new UnauthorizedException('Credenciales incorrectas');

    const token = this.jwtService.sign({ id: usuario.id, rol: usuario.rol });
    return {
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
      },
    };
  }
}
