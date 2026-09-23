import { NextResponse } from 'next/server';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'stok'; // stok, promo, pergerakan
    const filter = searchParams.get('filter') || 'all'; // fast, slow, all
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const skip = (page - 1) * limit;

    // Build the where clause
    let where: Prisma.ProductWhereInput = {};

    if (search) {
      where = {
        OR: [
          { sku: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { article: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    // Find all articles that have a negative stock
    const minusStockProducts = await prisma.product.findMany({
      where: { stok: { lt: 0 } },
      select: { article: true }
    });
    
    // Extract unique articles (some might be null)
    const minusArticlesSet = new Set(minusStockProducts.map(p => p.article).filter(Boolean));
    const minusArticlesArray = Array.from(minusArticlesSet) as string[];

    // Apply type specific filters
    if (type === 'promo') {
      where = {
        ...where,
        hargaPromo: { not: null, gt: 0 },
      };
    } else if (type === 'pergerakan') {
      if (filter === 'fast') {
        where = { ...where, sales_mtd: { gt: 5 } }; // terjual lebih dari 5 = fast move
      } else if (filter === 'slow') {
        where = { 
          ...where, 
          sales_mtd: { lte: 2 }, 
          stok: { gte: 0 },
          // Exclude products that are part of a plus-minus pair
          article: { notIn: minusArticlesArray } 
        }; 
      } else if (filter === 'minus') {
        // Instead of just stok < 0, we want ALL variants of an article that has a negative stock
        if (minusArticlesArray.length > 0) {
          where = { ...where, article: { in: minusArticlesArray } }; 
        } else {
          // If no minus products, force empty result
          where = { ...where, id: -1 };
        }
      } else if (filter === 'kritis') {
        where = { ...where, sales_mtd: { gte: 3 }, stok: { lte: 5, gte: 0 } }; // laku tapi stok menipis
      }
    } else if (type === 'stok') {
      if (filter === 'habis') {
        where = { ...where, stok: { lte: 0 } };
      } else if (filter === 'tersedia') {
        where = { ...where, stok: { gt: 0 } };
      }
    }

    // Determine sorting
    let orderBy: any = { updatedAt: 'desc' };
    
    if (type === 'pergerakan' && filter === 'fast') {
      orderBy = { sales_mtd: 'desc' };
    } else if (type === 'pergerakan' && filter === 'slow') {
      orderBy = [
        { sales_mtd: 'asc' },
        { stok: 'desc' }, // prioritas stok mati terbanyak
      ];
    } else if (type === 'pergerakan' && filter === 'minus') {
      orderBy = [
        { article: 'asc' }, // Group by article logically
        { stok: 'asc' }     // Put the minus one first
      ];
    } else if (type === 'pergerakan' && filter === 'kritis') {
      orderBy = [
        { stok: 'asc' }, // urutkan dari stok yang paling mepet (0, 1, 2)
        { sales_mtd: 'desc' } // lalu terjual terbanyak
      ];
    } else if (type === 'stok') {
      orderBy = { stok: 'desc' };
    }

    // Fetch data and count concurrently
    const [products, totalCount] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
      prisma.product.count({ where }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    return NextResponse.json({
      success: true,
      data: products,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages,
      }
    });

  } catch (error) {
    console.error('Error fetching reports:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
