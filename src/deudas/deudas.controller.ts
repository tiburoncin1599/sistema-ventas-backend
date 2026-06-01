import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Res,
  Header,
} from '@nestjs/common';
import { DeudasService } from './deudas.service';
import { CrearDeudaDto } from './dto/crear-deuda.dto';
import { PagarDeudaDto } from './dto/pagar-deuda.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Response } from 'express';
import  PDFDocument from 'pdfkit';

@Controller('deudas')
export class DeudasController {
  constructor(private readonly deudasService: DeudasService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'inventario', 'ventas')
  findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.deudasService.findAll(Number(page) || 1, Number(limit) || 50);
  }

  @Get('resumen')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'inventario', 'ventas')
  resumen() {
    return this.deudasService.resumen();
  }

  @Get('usuario/:id')
  @UseGuards(JwtAuthGuard)
  findByUsuario(@Param('id') id: string) {
    return this.deudasService.findByUsuario(+id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string) {
    return this.deudasService.findOne(+id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'inventario')
  crear(@Body() body: CrearDeudaDto) {
    return this.deudasService.crear(
      body.usuarioId,
      body.monto,
      body.descripcion,
    );
  }

  @Put(':id/pagar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'inventario')
  pagar(@Param('id') id: string, @Body() body: PagarDeudaDto) {
    return this.deudasService.pagar(+id, body.monto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'inventario')
  eliminar(@Param('id') id: string) {
    return this.deudasService.eliminar(+id);
  }

  @Get(':id/factura/pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename=factura-deuda.pdf')
  async facturaPDF(@Param('id') id: string, @Res() res: Response) {
    const deuda = await this.deudasService.findOne(+id);
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);

    doc
      .fontSize(22)
      .font('Helvetica-Bold')
      .text('COMPROBANTE DE PAGO', { align: 'center' });
    doc.moveDown(0.5);
    doc
      .fontSize(12)
      .font('Helvetica')
      .text(`Deuda #${deuda.id}`, { align: 'center' });
    doc.text(
      `Fecha: ${new Date(deuda.fecha_pago || deuda.fecha_creacion).toLocaleDateString('es-AR')}`,
      { align: 'center' },
    );
    doc.moveDown(1);

    doc.fontSize(12).font('Helvetica-Bold').text('Datos');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10);
    doc.text(`Personal: ${deuda.usuario?.nombre || ''}`);
    doc.text(`Descripción: ${deuda.descripcion || ''}`);
    doc.moveDown(0.5);

    doc.moveTo(40, doc.y).lineTo(550, doc.y).stroke('#ccc');
    doc.moveDown(0.5);

    const leftX = 40,
      rightX = 400;
    doc.font('Helvetica').fontSize(10);
    doc.text('Monto total:', leftX, doc.y);
    doc.text(`Bs${Number(deuda.monto).toFixed(2)}`, rightX, doc.y, {
      width: 150,
      align: 'right',
    });
    doc.moveDown(0.5);

    doc.text('Monto pagado:', leftX, doc.y);
    doc.text(`Bs${Number(deuda.monto_pagado).toFixed(2)}`, rightX, doc.y, {
      width: 150,
      align: 'right',
    });
    doc.moveDown(0.5);

    const saldo = deuda.monto - deuda.monto_pagado;
    doc.text('Saldo pendiente:', leftX, doc.y);
    doc.text(`Bs${Number(saldo).toFixed(2)}`, rightX, doc.y, {
      width: 150,
      align: 'right',
    });
    doc.moveDown(0.5);

    doc.moveTo(40, doc.y).lineTo(550, doc.y).stroke('#ccc');
    doc.moveDown(0.5);

    doc.font('Helvetica-Bold').fontSize(12);
    doc.text('Estado: ', leftX, doc.y);
    doc.text(deuda.estado.toUpperCase(), rightX, doc.y, {
      width: 150,
      align: 'right',
    });

    doc.end();
  }
}
