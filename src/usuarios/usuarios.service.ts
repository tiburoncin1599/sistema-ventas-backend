import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuario } from './usuario.entity';

function sinPassword(u: Usuario): Omit<Usuario, 'password_hash'> {
  const { password_hash: _p, ...rest } = u;
  void _p;
  return rest;
}

@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(Usuario)
    private usuariosRepo: Repository<Usuario>,
  ) {}

  async findAll() {
    const usuarios = await this.usuariosRepo.find();
    return usuarios.map(sinPassword);
  }

  async findOne(id: number) {
    const usuario = await this.usuariosRepo.findOne({ where: { id } });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
    return sinPassword(usuario);
  }

  findByEmail(email: string) {
    return this.usuariosRepo.findOne({ where: { email } });
  }

  crear(data: Partial<Usuario>) {
    const usuario = this.usuariosRepo.create(data);
    return this.usuariosRepo.save(usuario);
  }

  actualizar(id: number, data: Partial<Usuario>) {
    return this.usuariosRepo.update(id, data);
  }

  async eliminar(id: number) {
    const usuario = await this.usuariosRepo.findOne({ where: { id } });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
    return this.usuariosRepo.remove(usuario);
  }
}
