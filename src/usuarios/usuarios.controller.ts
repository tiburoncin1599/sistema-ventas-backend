import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CrearUsuarioDto } from './dto/crear-usuario.dto';
import { ActualizarUsuarioDto } from './dto/actualizar-usuario.dto';
import * as bcrypt from 'bcryptjs';

@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  findAll() {
    return this.usuariosService.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string) {
    return this.usuariosService.findOne(+id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async crear(@Body() body: CrearUsuarioDto) {
    const existe = await this.usuariosService.findByEmail(body.email);
    if (existe) throw new BadRequestException('El email ya está registrado');
    if (body.rol === 'admin' && body.email !== 'aaas@gmail.com') {
      throw new BadRequestException(
        'Solo aaas@gmail.com puede tener el rol de administrador',
      );
    }
    const hash = await bcrypt.hash(body.password, 10);
    const usuario = await this.usuariosService.crear({
      nombre: body.nombre,
      email: body.email,
      password_hash: hash,
      rol: body.rol || 'cliente',
    });
    const { password_hash: _p, ...result } = usuario;
    void _p;
    return result;
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async actualizar(
    @Param('id') id: string,
    @Body() body: ActualizarUsuarioDto,
  ) {
    const usuario = await this.usuariosService.findOne(+id);
    if (body.rol === 'admin' && usuario.email !== 'aaas@gmail.com') {
      throw new BadRequestException(
        'Solo aaas@gmail.com puede tener el rol de administrador',
      );
    }
    if (
      usuario.email === 'aaas@gmail.com' &&
      body.rol &&
      body.rol !== 'admin'
    ) {
      throw new BadRequestException(
        'No se puede cambiar el rol del administrador principal',
      );
    }
    const data: Partial<import('./usuario.entity').Usuario> = {};
    if (body.nombre) data.nombre = body.nombre;
    if (body.password)
      data.password_hash = await bcrypt.hash(body.password, 10);
    if (body.rol) data.rol = body.rol;
    if (body.activo !== undefined) data.activo = body.activo;
    await this.usuariosService.actualizar(+id, data);
    return this.usuariosService.findOne(+id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async eliminar(@Param('id') id: string) {
    const usuario = await this.usuariosService.findOne(+id);
    if (usuario.email === 'aaas@gmail.com') {
      throw new BadRequestException('No se puede eliminar al administrador principal');
    }
    await this.usuariosService.eliminar(+id);
    return { message: 'Usuario eliminado' };
  }
}
