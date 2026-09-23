import { NextResponse } from 'next/server';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: Request) {
  try {
    // [SUPER ENGINE] Auto-clean expired promos on the fly BEFORE any query!
    const todayStr = new Date().toISOString().split('T')[0];
    await prisma.product.updateMany({
      where: {
        hargaPromo: { not: null },
        toDate: { not: null, lt: todayStr }
      },
      data: {
        hargaPromo: null, diskon: null, discountType: null, acara: null, fromDate: null, toDate: null
      }
    });

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'stok'; // stok, promo, pergerakan
    const filter = searchParams.get('filter') || 'all'; // fast, slow, all
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const dept = searchParams.get('dept');
    const groupBy = searchParams.get('groupBy');

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

    if (dept) {
      where = { ...where, dept };
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
        where = { ...where, stok: { lte: 0 }, article: { notIn: minusArticlesArray } };
      } else if (filter === 'tersedia') {
        where = { ...where, stok: { gt: 0 }, article: { notIn: minusArticlesArray } };
      } else if (filter === 'minus') {
        if (minusArticlesArray.length > 0) {
          where = { ...where, article: { in: minusArticlesArray } }; 
        } else {
          where = { ...where, id: -1 };
        }
      } else {
        // filter === 'all'
        where = { ...where, article: { notIn: minusArticlesArray } };
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
      if (filter === 'minus') {
        orderBy = [
          { article: 'asc' },
          { stok: 'asc' }
        ];
      } else {
        orderBy = { stok: 'desc' };
      }
    }

    if (groupBy === 'dept') {
      const grouped = await prisma.product.groupBy({
        by: ['dept'],
        _count: { id: true },
        where,
        orderBy: { _count: { id: 'desc' } }
      });
      return NextResponse.json({
        success: true,
        data: grouped.map(g => ({ 
          dept: g.dept || 'Tanpa Departemen', 
          count: g._count.id 
        }))
      });
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
