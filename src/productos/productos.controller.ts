import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { ProductosService } from './productos.service';
import { CrearProductoDto } from './dto/crear-producto.dto';
import { ActualizarProductoDto } from './dto/actualizar-producto.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@Controller('productos')
export class ProductosController {
  constructor(private readonly productosService: ProductosService) {}

  @Get()
  findAll() {
    return this.productosService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productosService.findOne(+id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'inventario')
  crear(@Body() body: CrearProductoDto) {
    return this.productosService.crear(body);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'inventario')
  actualizar(@Param('id') id: string, @Body() body: ActualizarProductoDto) {
    return this.productosService.actualizar(+id, body);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'inventario')
  desactivar(@Param('id') id: string) {
    return this.productosService.desactivar(+id);
  }

  @Post('fix-imagenes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @HttpCode(200)
  async fixImagenes() {
    const productos = await this.productosService.findAllInclusoInactivos();
    const actualizados: { id: number; old: string; new: string }[] = [];
    for (const p of productos) {
      if (!p.imagen_url) continue;
      const oldUrl = p.imagen_url;
      let newUrl = oldUrl.replace(/\.jpg$/i, '.png');
      newUrl = newUrl
        .replace(/ gatillo /g, '_gatillo_')
        .replace(/ recarga /g, '_recarga_')
        .replace(/-gatillo-/g, '_gatillo_')
        .replace(/-recarga-/g, '_recarga_')
        .replace(/ gatillo\./g, '_gatillo.')
        .replace(/ recarga\./g, '_recarga.');
      if (newUrl !== oldUrl) {
        await this.productosService.actualizar(p.id, { imagen_url: newUrl });
        actualizados.push({ id: p.id, old: oldUrl, new: newUrl });
      }
    }
    return {
      message: 'Imágenes actualizadas',
      count: actualizados.length,
      actualizados,
    };
  }

  @Post('upload/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'inventario')
  @UseInterceptors(
    FileInterceptor('imagen', {
      storage: diskStorage({
        destination: join(__dirname, '..', '..', 'uploads', 'productos'),
        filename: (_req, file, cb) => {
          const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname)}`;
          cb(null, name);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/^image\//)) {
          cb(new BadRequestException('Solo se permiten imágenes'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async uploadImagen(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Archivo no recibido');
    const url = `/uploads/productos/${file.filename}`;
    await this.productosService.actualizar(+id, { imagen_url: url });
    return { imagen_url: url };
  }
}
