import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Categoria } from './categoria.entity';

@Injectable()
export class CategoriasService {
  constructor(
    @InjectRepository(Categoria)
    private categoriasRepo: Repository<Categoria>,
  ) {}

  findAll() {
    return this.categoriasRepo.find();
  }

  async findOne(id: number) {
    const categoria = await this.categoriasRepo.findOne({ where: { id } });
    if (!categoria) throw new NotFoundException('Categoría no encontrada');
    return categoria;
  }

  crear(data: Partial<Categoria>) {
    const categoria = this.categoriasRepo.create(data);
    return this.categoriasRepo.save(categoria);
  }

  async actualizar(id: number, data: Partial<Categoria>) {
    await this.findOne(id);
    await this.categoriasRepo.update(id, data);
    return this.findOne(id);
  }
}
