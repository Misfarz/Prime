const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema'); 
const Category = require('../../models/categorySchema'); 
const User = require('../../models/userSchema'); 
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit-table');
const fs = require('fs');
const path = require('path');


const formatDate = (date) => {
    return new Date(date).toISOString().split('T')[0];
};


const getDateRange = (filterType, customStartDate, customEndDate) => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    let startDate = new Date();
    let endDate = new Date(today);
    
    switch (filterType) {
        case 'daily':
     
            startDate.setHours(0, 0, 0, 0);
            break;
        case 'weekly':
     
            startDate.setDate(today.getDate() - 7);
            startDate.setHours(0, 0, 0, 0);
            break;
        case 'monthly':
         
            startDate.setDate(today.getDate() - 30);
            startDate.setHours(0, 0, 0, 0);
            break;
        case 'yearly':
        
            startDate.setDate(today.getDate() - 365);
            startDate.setHours(0, 0, 0, 0);
            break;
        case 'custom':
          
            if (customStartDate && customEndDate) {
                startDate = new Date(customStartDate);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(customEndDate);
                endDate.setHours(23, 59, 59, 999);
            }
            break;
        default:
          
            startDate.setHours(0, 0, 0, 0);
    }
    
    return { startDate, endDate };
};


const loadSalesReport = async (req, res) => {
    try {
        const filterType = req.query.filterType || 'daily';
        const customStartDate = req.query.startDate;
        const customEndDate = req.query.endDate;
        
        const { startDate, endDate } = getDateRange(filterType, customStartDate, customEndDate);
        
       
        const orders = await Order.find({
            createdAt: { $gte: startDate, $lte: endDate },
            orderStatus: { $in: ['Delivered'] }
        }).populate('user', 'name email');
        
    
        let totalSales = 0;
        let totalDiscount = 0;
        let totalOrders = orders.length;
        
        orders.forEach(order => {
            totalSales += order.total;
            totalDiscount += order.discount || 0;
        });
        
        res.render('sales-report', {
            orders,
            totalSales,
            totalDiscount,
            totalOrders,
            filterType,
            startDate: formatDate(startDate),
            endDate: formatDate(endDate)
        });
    } catch (error) {
        console.error('Error loading sales report:', error);
        res.status(500).render('admin/sales-report', { 
            error: 'Failed to load sales report',
            orders: [],
            totalSales: 0,
            totalDiscount: 0,
            totalOrders: 0,
            filterType: 'daily',
            startDate: formatDate(new Date()),
            endDate: formatDate(new Date())
        });
    }
};


const downloadExcelReport = async (req, res) => {
    try {
        const filterType = req.query.filterType || 'daily';
        const customStartDate = req.query.startDate;
        const customEndDate = req.query.endDate;
        
        const { startDate, endDate } = getDateRange(filterType, customStartDate, customEndDate);
        
     
        const orders = await Order.find({
            createdAt: { $gte: startDate, $lte: endDate },
            orderStatus: { $in: ['Delivered'] }
        }).populate('user', 'name email');
        
      
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Sales Report');
        
   
        worksheet.mergeCells('A1:H1');
        worksheet.getCell('A1').value = 'Prime Sales Report';
        worksheet.getCell('A1').font = { size: 16, bold: true };
        worksheet.getCell('A1').alignment = { horizontal: 'center' };
        
  
        worksheet.mergeCells('A2:H2');
        worksheet.getCell('A2').value = `Period: ${formatDate(startDate)} to ${formatDate(endDate)}`;
        worksheet.getCell('A2').font = { size: 12 };
        worksheet.getCell('A2').alignment = { horizontal: 'center' };
        
   
        let totalSales = 0;
        let totalDiscount = 0;
        orders.forEach(order => {
            totalSales += order.total;
            totalDiscount += order.discount || 0;
        });
        
        worksheet.mergeCells('A3:H3');
        worksheet.getCell('A3').value = `Total Orders: ${orders.length} | Total Sales: ₹${totalSales.toFixed(2)} | Total Discount: ₹${totalDiscount.toFixed(2)}`;
        worksheet.getCell('A3').font = { size: 12, bold: true };
        worksheet.getCell('A3').alignment = { horizontal: 'center' };
        

        worksheet.addRow(['Order ID', 'Customer', 'Date', 'Payment Method', 'Status', 'Subtotal', 'Discount', 'Total']);
        
    
        worksheet.getRow(4).font = { bold: true };
        worksheet.getRow(4).alignment = { horizontal: 'center' };
        

        orders.forEach(order => {
            worksheet.addRow([
                order.orderNumber,
                order.user ? order.user.name : 'Unknown',
                new Date(order.createdAt).toLocaleDateString(),
                order.paymentMethod,
                order.orderStatus,
                `₹${order.subtotal.toFixed(2)}`,
                `₹${(order.discount || 0).toFixed(2)}`,
                `₹${order.total.toFixed(2)}`
            ]);
        });
        
     
        for (let i = 5; i < 5 + orders.length; i++) {
            worksheet.getRow(i).alignment = { horizontal: 'center' };
        }
        
     
        worksheet.columns.forEach(column => {
            column.width = 15;
        });
        
      
        const fileName = `sales_report_${formatDate(startDate)}_to_${formatDate(endDate)}.xlsx`;
        const filePath = path.join(__dirname, '../../public/downloads', fileName);
        
        
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
  
        await workbook.xlsx.writeFile(filePath);
    
        res.download(filePath, fileName, (err) => {
            if (err) {
                console.error('Error sending file:', err);
                res.status(500).send('Error downloading file');
            }
            
         
            fs.unlink(filePath, (unlinkErr) => {
                if (unlinkErr) console.error('Error deleting file:', unlinkErr);
            });
        });
    } catch (error) {
        console.error('Error generating Excel report:', error);
        res.status(500).send('Failed to generate Excel report');
    }
};


const downloadPdfReport = async (req, res) => {
    try {
        const filterType = req.query.filterType || 'daily';
        const customStartDate = req.query.startDate;
        const customEndDate = req.query.endDate;
        
        const { startDate, endDate } = getDateRange(filterType, customStartDate, customEndDate);
        
        
        const orders = await Order.find({
            createdAt: { $gte: startDate, $lte: endDate },
            orderStatus: { $in: ['Delivered'] }
        }).populate('user', 'name email');
        
      
        let totalSales = 0;
        let totalDiscount = 0;
        orders.forEach(order => {
            totalSales += order.total;
            totalDiscount += order.discount || 0;
        });
        
        const fileName = `sales_report_${formatDate(startDate)}_to_${formatDate(endDate)}.pdf`;
        const filePath = path.join(__dirname, '../../public/downloads', fileName);
        
     
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        
        const doc = new PDFDocument({ margin: 30, size: 'A4' });
        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);
 
        doc.fontSize(18).text('Prime Sales Report', { align: 'center' });
        doc.moveDown();
        
      
        doc.fontSize(12).text(`Period: ${formatDate(startDate)} to ${formatDate(endDate)}`, { align: 'center' });
        doc.moveDown();
        
      
        doc.fontSize(12).text(`Total Orders: ${orders.length} | Total Sales: ₹${totalSales.toFixed(2)} | Total Discount: ₹${totalDiscount.toFixed(2)}`, { align: 'center' });
        doc.moveDown(2);
        
     
        const tableData = {
            headers: ['Order ID', 'Customer', 'Date', 'Payment', 'Status', 'Subtotal', 'Discount', 'Total'],
            rows: orders.map(order => [
                order.orderNumber,
                order.user ? order.user.name : 'Unknown',
                new Date(order.createdAt).toLocaleDateString(),
                order.paymentMethod,
                order.orderStatus,
                `₹${order.subtotal.toFixed(2)}`,
                `₹${(order.discount || 0).toFixed(2)}`,
                `₹${order.total.toFixed(2)}`
            ])
        };
        
  
        await doc.table(tableData, {
            prepareHeader: () => doc.font('Helvetica-Bold').fontSize(10),
            prepareRow: () => doc.font('Helvetica').fontSize(10)
        });
        
       
        doc.end();
        
      
        stream.on('finish', () => {
          
            res.download(filePath, fileName, (err) => {
                if (err) {
                    console.error('Error sending file:', err);
                    res.status(500).send('Error downloading file');
                }
                
            
                fs.unlink(filePath, (unlinkErr) => {
                    if (unlinkErr) console.error('Error deleting file:', unlinkErr);
                });
            });
        });
    } catch (error) {
        console.error('Error generating PDF report:', error);
        res.status(500).send('Failed to generate PDF report');
    }
};

const loadDashboard = async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.redirect('/admin/login');
        }

        const filterType = req.query.filterType || 'monthly';
        const customStartDate = req.query.customStartDate;
        const customEndDate = req.query.customEndDate;
        const { startDate, endDate } = getDateRange(filterType, customStartDate, customEndDate);

        // --- 1. Sales Trend Line Chart Data ---
        let salesTrendLabels = [];
        let salesTrendData = [];
        let salesChartTitle = '';

        const ordersForTrendChart = await Order.find({
            createdAt: { $gte: startDate, $lte: endDate },
            orderStatus: 'Delivered'
        }).sort({ createdAt: 'asc' });

        if (filterType === 'yearly') {
            salesChartTitle = `Sales Trend Over the Last Year (Monthly Breakdown)`;
            const salesByMonth = {};
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            let currentMonthIter = new Date(startDate);
            currentMonthIter.setDate(1);
            let endMonthIter = new Date(endDate);
            while(currentMonthIter <= endMonthIter) {
                const monthKey = monthNames[currentMonthIter.getMonth()] + " " + currentMonthIter.getFullYear();
                salesByMonth[monthKey] = 0;
                currentMonthIter.setMonth(currentMonthIter.getMonth() + 1);
            }
            ordersForTrendChart.forEach(order => {
                const monthKey = monthNames[order.createdAt.getMonth()] + " " + order.createdAt.getFullYear();
                if (salesByMonth.hasOwnProperty(monthKey)) salesByMonth[monthKey] += order.total;
            });
            salesTrendLabels = Object.keys(salesByMonth);
            salesTrendData = Object.values(salesByMonth);
        } else {
            if (filterType === 'monthly') salesChartTitle = `Sales Trend Over the Last 30 Days (Daily)`;
            else if (filterType === 'weekly') salesChartTitle = `Sales Trend Over the Last 7 Days (Daily)`;
            else if (filterType === 'daily') salesChartTitle = `Sales Trend Today`;
            else if (filterType === 'custom') salesChartTitle = `Sales Trend: ${formatDate(startDate)} to ${formatDate(endDate)} (Daily)`;
            else salesChartTitle = `Sales Trend (Daily Breakdown)`;

            const salesByDay = {};
            let currentDateIter = new Date(startDate);
            while(currentDateIter <= endDate) {
                salesByDay[formatDate(currentDateIter)] = 0;
                currentDateIter.setDate(currentDateIter.getDate() + 1);
            }
            ordersForTrendChart.forEach(order => {
                const dayString = formatDate(order.createdAt);
                if (salesByDay.hasOwnProperty(dayString)) salesByDay[dayString] += order.total;
            });
            salesTrendLabels = Object.keys(salesByDay);
            salesTrendData = Object.values(salesByDay);
        }

       
        const overallStats = await Order.aggregate([
            { $match: { createdAt: { $gte: startDate, $lte: endDate }, orderStatus: 'Delivered' } },
            { $group: { _id: null, totalSales: { $sum: '$total' }, totalOrders: { $sum: 1 } } }
        ]);
        const periodStats = overallStats.length > 0 ? overallStats[0] : { totalSales: 0, totalOrders: 0 };

        //average sales
        let averageSalesValue = 0;
        const diffTime = Math.abs(endDate.getTime() - startDate.getTime()); // Use getTime() for difference
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end day, ensure it's at least 1
        
        if (periodStats.totalSales > 0) {
             averageSalesValue = periodStats.totalSales / (diffDays > 0 ? diffDays : 1);
        }

        const bestSellingProducts = await Order.aggregate([
            { $match: { orderStatus: 'Delivered' } },
            { $unwind: '$items' },
            {
                $group: {
                    _id: '$items.product',
                    totalQuantitySold: { $sum: '$items.quantity' }
                }
            },
            { $sort: { totalQuantitySold: -1 } },
            { $limit: 3 },
            {
                $lookup: {
                    from: 'products', 
                    localField: '_id',
                    foreignField: '_id',
                    as: 'productDetails'
                }
            },
            { $unwind: '$productDetails' }
        ]);

      
        const bestSellingCategoryList = await Order.aggregate([
            { $match: { orderStatus: 'Delivered' } },
            { $unwind: '$items' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.product',
                    foreignField: '_id',
                    as: 'productInfo'
                }
            },
            { $unwind: '$productInfo' },
            {
                $group: {
                    _id: '$productInfo.category',
                    totalQuantitySold: { $sum: '$items.quantity' }
                }
            },
            { $sort: { totalQuantitySold: -1 } },
            { $limit: 3 },
            {
                $lookup: {
                    from: 'categories', 
                    localField: '_id',
                    foreignField: '_id',
                    as: 'categoryDetails'
                }
            },
            { $unwind: '$categoryDetails' }
        ]);

        const totalUsers = await User.countDocuments();
        const totalProducts = await Product.countDocuments();
        const totalActiveOrders = await Order.countDocuments({ orderStatus: { $nin: ['Delivered', 'Cancelled', 'Returned'] } });
        const latestOrders = await Order.find().sort({ createdAt: -1 }).limit(5).populate('user', 'name');

        res.render('dashboard', { 
            filterType,
            currentStartDate: formatDate(startDate),
            currentEndDate: formatDate(endDate),
            
            salesTrendLabels: JSON.stringify(salesTrendLabels),
            salesTrendData: JSON.stringify(salesTrendData),
            salesChartTitle,

            periodStats,
            averageSalesValue,

            bestSellingProducts,
            bestSellingCategoryList,
            totalUsers,
            totalProducts,
            totalActiveOrders,
            latestOrders,
            pageTitle: 'Admin Dashboard'
        });
    } catch (error) {
        console.error('Error loading dashboard:', error);
        res.status(500).render('dashboard', { 
            error: 'Failed to load dashboard data. Please try again later.',
            pageTitle: 'Admin Dashboard - Error',
            filterType: req.query.filterType || 'monthly',
            currentStartDate: formatDate(new Date()),
            currentEndDate: formatDate(new Date()),
            salesTrendLabels: JSON.stringify([]),
            salesTrendData: JSON.stringify([]),
            salesChartTitle: 'Sales Data Unavailable',

            periodStats: { totalSales: 0, totalOrders: 0 },
            averageSalesValue: 0,
            bestSellingProducts: [],
            bestSellingCategoryList: [],
            totalUsers: 0, totalProducts: 0, totalActiveOrders: 0, latestOrders: []
        });
    }
};


module.exports = {
    loadSalesReport,
    downloadExcelReport,
    downloadPdfReport,
    loadDashboard
};
