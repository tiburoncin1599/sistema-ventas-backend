import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Res,
  Header,
} from '@nestjs/common';
import { PedidosService } from './pedidos.service';
import { CrearPedidoDto } from './dto/crear-pedido.dto';
import { ActualizarEstadoDto } from './dto/actualizar-estado.dto';
import { AgregarItemsDto } from './dto/agregar-items.dto';
import { ActualizarItemDto } from './dto/actualizar-item.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Response } from 'express';
import { join } from 'path';
import * as fs from 'fs';
import * as QRCode from 'qrcode';
import * as PDFDocument from 'pdfkit';

@Controller('pedidos')
export class PedidosController {
  constructor(private readonly pedidosService: PedidosService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'inventario')
  findAll() {
    return this.pedidosService.findAll();
  }

  @Get('usuario/:id')
  @UseGuards(JwtAuthGuard)
  findByUsuario(@Param('id') id: string) {
    return this.pedidosService.findByUsuario(+id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string) {
    const pedido = await this.pedidosService.findOne(+id);
    const detalles = await this.pedidosService.findDetalles(+id);
    return { ...pedido, detalles };
  }

  @Get(':id/factura')
  @UseGuards(JwtAuthGuard)
  async factura(@Param('id') id: string) {
    return this.pedidosService.findFactura(+id);
  }

  @Get(':id/factura/pdf')
  @UseGuards(JwtAuthGuard)
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename=factura.pdf')
  async facturaPDF(@Param('id') id: string, @Res() res: Response) {
    const data = await this.pedidosService.findFactura(+id);
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);

    // Logo de fondo
    const logoPath = join(__dirname, '..', '..', '..', 'logo.png');
    if (fs.existsSync(logoPath)) {
      doc.opacity(0.08);
      doc.image(logoPath, 100, 180, { width: 400, height: 400 });
      doc.opacity(1);
    }

    const bold = (text: string, opts: Record<string, any> = {}) =>
      doc
        .font('Helvetica-Bold')
        .fontSize(opts['size'] || 12)
        .text(text, opts);
    const normal = (text: string, opts: Record<string, any> = {}) =>
      doc
        .font('Helvetica')
        .fontSize(opts['size'] || 10)
        .text(text, opts);

    // Header
    doc
      .fontSize(22)
      .font('Helvetica-Bold')
      .fillColor('#005a24')
      .text('SISTEMA DE VENTAS', { align: 'center' });
    doc.moveDown(0.3);
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .fillColor('#333')
      .text('FACTURA', { align: 'center' });
    doc.moveDown(0.3);
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#666')
      .text(`Pedido N\u00B0 ${data.pedido.id}`, { align: 'center' });
    doc.text(
      `Fecha: ${new Date(data.pedido.creado_en).toLocaleDateString('es-AR')}`,
      { align: 'center' },
    );
    doc.moveDown(1);

    // Cliente
    doc.fillColor('#005a24').fontSize(12).font('Helvetica-Bold');
    const cliHeaderY = doc.y;
    doc.text('DATOS DEL CLIENTE', 40, cliHeaderY);
    doc.moveDown(0.5);
    const cli = data.pedido.usuario;
    doc.fillColor('#333');
    if (cli) {
      normal(`Nombre: ${cli.nombre || ''}`);
      if (cli.carnet) normal(`Carnet / CI: ${cli.carnet}`);
      if (cli.email) normal(`Email: ${cli.email}`);
      if (cli.ubicacion) normal(`Ubicaci\u00F3n: ${cli.ubicacion}`);
      if (data.pedido.direccion_entrega)
        normal(`Direcci\u00F3n de entrega: ${data.pedido.direccion_entrega}`);
    }
    doc.moveDown(0.5);

    // Personal que lo atendió
    const proc = data.pedido.procesador;
    if (proc) {
      doc.fillColor('#005a24').fontSize(12).font('Helvetica-Bold');
      doc.text('ATENDIDO POR');
      doc.moveDown(0.3);
      doc.fillColor('#333').font('Helvetica').fontSize(10);
      normal(`Nombre: ${proc.nombre || ''}`);
      if (proc.email) normal(`Email: ${proc.email}`);
      doc.moveDown(0.5);
    }

    // Linea separadora
    doc.strokeColor('#ccc').lineWidth(1);
    doc.moveTo(40, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

    // Tabla header
    const col1 = 40,
      col2 = 220,
      col3 = 340,
      col4 = 460;
    const row = (y: number) => {
      doc
        .fillColor('#005a24')
        .font('Helvetica-Bold')
        .fontSize(10);
      doc.text('Producto', col1, y, { width: 170 });
      doc.text('Cant', col2, y, { width: 50, align: 'center' });
      doc.text('Precio', col3, y, { width: 100, align: 'right' });
      doc.text('Subtotal', col4, y, { width: 80, align: 'right' });
    };
    row(doc.y);
    doc.moveDown(0.3);
    doc.strokeColor('#005a24').lineWidth(0.5);
    doc.moveTo(40, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.3);

    // Detalles
    data.detalles.forEach((d) => {
      const y = doc.y;
      doc.fillColor('#333').font('Helvetica').fontSize(10);
      doc.text(d.producto?.nombre || `Producto #${d.producto_id}`, col1, y, {
        width: 170,
      });
      doc.text(String(d.cantidad), col2, y, { width: 50, align: 'center' });
      doc.text(`Bs${Number(d.precio_unitario).toFixed(2)}`, col3, y, {
        width: 100,
        align: 'right',
      });
      doc.text(
        `Bs${(d.cantidad * Number(d.precio_unitario)).toFixed(2)}`,
        col4,
        y,
        { width: 80, align: 'right' },
      );
      doc.moveDown(0.8);
    });

    // Total
    doc.moveDown(0.5);
    doc.strokeColor('#005a24').lineWidth(1);
    doc.moveTo(40, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fillColor('#005a24').font('Helvetica-Bold').fontSize(14);
    const totalY = doc.y;
    doc.text('TOTAL:', 40, totalY, { width: 100 });
    doc.text(`Bs${Number(data.pedido.total).toFixed(2)}`, 440, totalY, {
      width: 100,
      align: 'right',
    });

    // Estado
    doc.moveDown(1.5);
    doc.fillColor('#666').font('Helvetica').fontSize(10);
    doc.text(`Estado: ${data.pedido.estado}`, { align: 'center' });

    doc.end();
  }

  @Get(':id/factura/qr')
  @UseGuards(JwtAuthGuard)
  async facturaQR(@Param('id') id: string) {
    const baseUrl =
      process.env.API_URL || 'https://web-production-c811d.up.railway.app';
    const pdfUrl = `${baseUrl}/pedidos/${id}/factura/pdf`;
    const qr = await QRCode.toDataURL(pdfUrl);
    return { qr, pdf_url: pdfUrl, pedido_id: id };
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  crear(@Body() body: CrearPedidoDto) {
    return this.pedidosService.crear(
      body.usuarioId,
      body.direccion,
      body.items,
      body.notas,
      body.procesadoPor,
    );
  }

  @Get('ventas/personal')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'inventario')
  async ventasPersonal() {
    const pedidos = await this.pedidosService.findAll();
    const ventasPorUsuario: Record<number, any> = {};

    for (const p of pedidos) {
      if (!p.procesado_por) continue;
      if (!ventasPorUsuario[p.procesado_por]) {
        ventasPorUsuario[p.procesado_por] = {
          usuario_id: p.procesado_por,
          usuario_nombre:
            (p as any).procesador?.nombre || `Usuario #${p.procesado_por}`,
          total_pedidos: 0,
          total_vendido: 0,
          pedidos: [],
        };
      }
      ventasPorUsuario[p.procesado_por].total_pedidos++;
      ventasPorUsuario[p.procesado_por].total_vendido += Number(p.total);
      ventasPorUsuario[p.procesado_por].pedidos.push({
        id: p.id,
        total: p.total,
        estado: p.estado,
        fecha: p.creado_en,
      });
    }

    return Object.values(ventasPorUsuario);
  }

  @Put(':id/estado')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'inventario')
  actualizarEstado(@Param('id') id: string, @Body() body: ActualizarEstadoDto) {
    return this.pedidosService.actualizarEstado(+id, body.estado);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  eliminar(@Param('id') id: string) {
    return this.pedidosService.eliminar(+id);
  }

  @Post(':id/items')
  @UseGuards(JwtAuthGuard)
  agregarItems(@Param('id') id: string, @Body() body: AgregarItemsDto) {
    return this.pedidosService.agregarItems(+id, body.items);
  }

  @Delete(':id/items/:itemId')
  @UseGuards(JwtAuthGuard)
  eliminarItem(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.pedidosService.eliminarItem(+id, +itemId);
  }

  @Put(':id/items/:itemId')
  @UseGuards(JwtAuthGuard)
  actualizarItemCantidad(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: ActualizarItemDto,
  ) {
    return this.pedidosService.actualizarItemCantidad(
      +id,
      +itemId,
      body.cantidad,
    );
  }
}
