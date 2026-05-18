import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Pedido } from './pedido.entity';
import { DetallePedido } from './detalle-pedido.entity';
import { InventarioService } from '../inventario/inventario.service';

interface ItemPedido {
  producto_id: number;
  cantidad: number;
  precio: number;
}

@Injectable()
export class PedidosService {
  constructor(
    @InjectRepository(Pedido)
    private pedidosRepo: Repository<Pedido>,
    @InjectRepository(DetallePedido)
    private detalleRepo: Repository<DetallePedido>,
    private inventarioService: InventarioService,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  findAll() {
    return this.pedidosRepo.find({
      relations: ['usuario', 'procesador'],
      order: { creado_en: 'DESC' },
    });
  }

  findByUsuario(usuarioId: number) {
    return this.pedidosRepo.find({
      where: { usuario_id: usuarioId },
      relations: ['usuario', 'procesador'],
      order: { creado_en: 'DESC' },
    });
  }

  async findOne(id: number) {
    const pedido = await this.pedidosRepo.findOne({
      where: { id },
      relations: ['usuario', 'procesador'],
    });
    if (!pedido) throw new NotFoundException('Pedido no encontrado');
    return pedido;
  }

  async findDetalles(pedidoId: number) {
    return this.detalleRepo.find({
      where: { pedido_id: pedidoId },
      relations: ['producto'],
    });
  }

  async findFactura(id: number) {
    const pedido = await this.findOne(id);
    const detalles = await this.findDetalles(id);
    return { pedido, detalles };
  }

  async crear(
    usuarioId: number,
    direccion: string | undefined,
    items: ItemPedido[],
    notas?: string,
    procesadoPor?: number,
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const total = items.reduce((sum, i) => sum + i.precio * i.cantidad, 0);

      const pedido = queryRunner.manager.create(Pedido, {
        usuario_id: usuarioId,
        procesado_por: procesadoPor,
        total,
        direccion_entrega: direccion || '',
        notas: notas || '',
        estado: 'pendiente',
      });
      const pedidoGuardado = await queryRunner.manager.save(pedido);

      for (const item of items) {
        await this.inventarioService.descontar(item.producto_id, item.cantidad);
        const detalle = queryRunner.manager.create(DetallePedido, {
          pedido_id: pedidoGuardado.id,
          producto_id: item.producto_id,
          cantidad: item.cantidad,
          precio_unitario: item.precio,
        });
        await queryRunner.manager.save(detalle);
      }

      await queryRunner.commitTransaction();
      return this.findOne(pedidoGuardado.id);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  private async findDetallesConManager(
    manager: import('typeorm').EntityManager,
    pedidoId: number,
  ) {
    return manager.find(DetallePedido, {
      where: { pedido_id: pedidoId },
      relations: ['producto'],
    });
  }

  async actualizarEstado(id: number, estado: string) {
    await this.findOne(id);
    await this.pedidosRepo.update(id, { estado });
    return this.findOne(id);
  }

  async agregarItems(pedidoId: number, items: ItemPedido[]) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const pedido = await this.findOne(pedidoId);
      if (pedido.estado === 'cancelado' || pedido.estado === 'entregado') {
        throw new BadRequestException(
          'No se puede modificar un pedido cancelado o entregado',
        );
      }

      for (const item of items) {
        await this.inventarioService.descontar(item.producto_id, item.cantidad);
        const detalle = queryRunner.manager.create(DetallePedido, {
          pedido_id: pedidoId,
          producto_id: item.producto_id,
          cantidad: item.cantidad,
          precio_unitario: item.precio,
        });
        await queryRunner.manager.save(detalle);
      }

      const detalles = await this.findDetallesConManager(queryRunner.manager, pedidoId);
      const total = detalles.reduce(
        (sum, d) => sum + Number(d.precio_unitario) * d.cantidad,
        0,
      );
      await queryRunner.manager.update(Pedido, pedidoId, { total });

      await queryRunner.commitTransaction();
      return this.findFactura(pedidoId);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async eliminarItem(pedidoId: number, itemId: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const pedido = await this.findOne(pedidoId);
      if (pedido.estado === 'cancelado' || pedido.estado === 'entregado') {
        throw new BadRequestException(
          'No se puede modificar un pedido cancelado o entregado',
        );
      }

      const detalle = await this.detalleRepo.findOne({
        where: { id: itemId, pedido_id: pedidoId },
      });
      if (!detalle)
        throw new NotFoundException('Detalle del pedido no encontrado');

      await this.inventarioService.devolver(
        detalle.producto_id,
        detalle.cantidad,
      );
      await queryRunner.manager.delete(DetallePedido, itemId);

      const detalles = await this.findDetallesConManager(queryRunner.manager, pedidoId);
      const total =
        detalles.length > 0
          ? detalles.reduce(
              (sum, d) => sum + Number(d.precio_unitario) * d.cantidad,
              0,
            )
          : 0;
      await queryRunner.manager.update(Pedido, pedidoId, { total });

      await queryRunner.commitTransaction();
      return this.findFactura(pedidoId);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async eliminar(id: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const detalles = await this.findDetalles(id);

      for (const detalle of detalles) {
        await this.inventarioService.devolver(
          detalle.producto_id,
          detalle.cantidad,
        );
      }

      await queryRunner.manager.delete(DetallePedido, { pedido_id: id });
      await queryRunner.manager.delete(Pedido, id);

      await queryRunner.commitTransaction();
      return { message: 'Pedido eliminado correctamente' };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async actualizarItemCantidad(
    pedidoId: number,
    itemId: number,
    nuevaCantidad: number,
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const pedido = await this.findOne(pedidoId);
      if (pedido.estado === 'cancelado' || pedido.estado === 'entregado') {
        throw new BadRequestException(
          'No se puede modificar un pedido cancelado o entregado',
        );
      }

      const detalle = await this.detalleRepo.findOne({
        where: { id: itemId, pedido_id: pedidoId },
      });
      if (!detalle)
        throw new NotFoundException('Detalle del pedido no encontrado');

      const diff = nuevaCantidad - detalle.cantidad;
      if (diff > 0) {
        await this.inventarioService.descontar(detalle.producto_id, diff);
      } else if (diff < 0) {
        await this.inventarioService.devolver(
          detalle.producto_id,
          Math.abs(diff),
        );
      }

      await queryRunner.manager.update(DetallePedido, itemId, {
        cantidad: nuevaCantidad,
      });

      const detalles = await this.findDetallesConManager(queryRunner.manager, pedidoId);
      const total = detalles.reduce(
        (sum, d) => sum + Number(d.precio_unitario) * d.cantidad,
        0,
      );
      await queryRunner.manager.update(Pedido, pedidoId, { total });

      await queryRunner.commitTransaction();
      return this.findFactura(pedidoId);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
