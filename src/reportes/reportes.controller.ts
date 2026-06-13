import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ReportesService } from './reportes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import PDFDocument from 'pdfkit';
import { join } from 'path';
import { existsSync } from 'fs';

@Controller('reportes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'ventas')
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  @Get('ventas-por-fecha')
  ventasPorFecha(
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.reportesService.ventasPorFecha(desde, hasta);
  }

  @Get('ventas-por-producto')
  ventasPorProducto(
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('categoria_id') categoria_id?: string,
  ) {
    return this.reportesService.ventasPorProducto(
      desde,
      hasta,
      categoria_id ? +categoria_id : undefined,
    );
  }

  @Get('ventas-por-categoria')
  ventasPorCategoria(
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.reportesService.ventasPorCategoria(desde, hasta);
  }

  @Get('ganancias')
  ganancias(
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.reportesService.ganancias(desde, hasta);
  }

  @Get('inventario')
  inventarioActual() {
    return this.reportesService.inventarioActual();
  }

  @Get('clientes-frecuentes')
  clientesFrecuentes() {
    return this.reportesService.clientesFrecuentes();
  }

  @Get('exportar/csv')
  async exportarCSV(
    @Res() res: Response,
    @Query('tipo') tipo: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    const csv = await this.reportesService.exportarCSV(tipo, desde, hasta);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${tipo}-${Date.now()}.csv"`);
    res.send(csv);
  }

  @Get('exportar/pdf')
  async exportarPDF(
    @Res() res: Response,
    @Query('tipo') tipo: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    let data: Record<string, unknown>[];
    let titulo: string;

    switch (tipo) {
      case 'ventas-por-fecha':
        data = await this.reportesService.ventasPorFecha(desde, hasta);
        titulo = 'Reporte de Ventas por Fecha';
        break;
      case 'ganancias':
        data = await this.reportesService.ganancias(desde, hasta);
        titulo = 'Reporte de Ganancias';
        break;
      case 'inventario':
        data = await this.reportesService.inventarioActual();
        titulo = 'Reporte de Inventario';
        break;
      default:
        data = [];
        titulo = 'Reporte';
    }

    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${tipo}-${Date.now()}.pdf"`);
    doc.pipe(res);

    const drawWatermark = () => {
      const savedY = doc.y;
      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const wmWidth = pageW * 0.60;
      const wmX = (pageW - wmWidth) / 2;
      const wmY = (pageH - wmWidth) / 2;
      doc.opacity(0.12);
      const logoFile = join(__dirname, '..', '..', 'logo.png');
      if (existsSync(logoFile)) {
        try { doc.image(logoFile, wmX, wmY, { width: wmWidth }); } catch {}
      }
      doc.opacity(1);
      doc.y = savedY;
    };
    drawWatermark();
    doc.on('pageAdded', () => { drawWatermark(); });

    doc.fontSize(18).text(titulo, { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`Generado: ${new Date().toLocaleDateString()}`, { align: 'right' });
    doc.moveDown();

    if (data.length > 0) {
      const headers = Object.keys(data[0]);
      const tableTop = doc.y;
      const colWidth = Math.min(120, (doc.page.width - 60) / headers.length);

      doc.fontSize(8).font('Helvetica-Bold');
      headers.forEach((h, i) => {
        doc.text(h, 30 + i * colWidth, tableTop, { width: colWidth, align: 'left' });
      });
      doc.moveDown();

      doc.font('Helvetica').fontSize(7);
      data.forEach((row, rowIdx) => {
        const y = doc.y;
        if (y > doc.page.height - 50) {
          doc.addPage();
        }
        headers.forEach((h, i) => {
          const val = row[h]?.toString() || '';
          doc.text(val, 30 + i * colWidth, doc.y, { width: colWidth, align: 'left' });
        });
        if (rowIdx < data.length - 1) doc.moveDown(0.3);
      });
    }

    doc.end();
  }
}
