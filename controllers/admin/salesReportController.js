const Order = require('../../models/orderSchema');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit-table');
const fs = require('fs');
const path = require('path');

// Helper function to format date for query
const formatDate = (date) => {
    return new Date(date).toISOString().split('T')[0];
};

// Helper function to get date range based on filter type
const getDateRange = (filterType, customStartDate, customEndDate) => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    let startDate = new Date();
    let endDate = new Date(today);
    
    switch (filterType) {
        case 'daily':
            // Today
            startDate.setHours(0, 0, 0, 0);
            break;
        case 'weekly':
            // Last 7 days
            startDate.setDate(today.getDate() - 7);
            startDate.setHours(0, 0, 0, 0);
            break;
        case 'monthly':
            // Last 30 days
            startDate.setDate(today.getDate() - 30);
            startDate.setHours(0, 0, 0, 0);
            break;
        case 'yearly':
            // Last 365 days
            startDate.setDate(today.getDate() - 365);
            startDate.setHours(0, 0, 0, 0);
            break;
        case 'custom':
            // Custom date range
            if (customStartDate && customEndDate) {
                startDate = new Date(customStartDate);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(customEndDate);
                endDate.setHours(23, 59, 59, 999);
            }
            break;
        default:
            // Default to today
            startDate.setHours(0, 0, 0, 0);
    }
    
    return { startDate, endDate };
};

// Load sales report page
const loadSalesReport = async (req, res) => {
    try {
        const filterType = req.query.filterType || 'daily';
        const customStartDate = req.query.startDate;
        const customEndDate = req.query.endDate;
        
        const { startDate, endDate } = getDateRange(filterType, customStartDate, customEndDate);
        
        // Query orders within the date range and with status "Delivered"
        const orders = await Order.find({
            createdAt: { $gte: startDate, $lte: endDate },
            orderStatus: { $in: ['Delivered'] }
        }).populate('user', 'name email');
        
        // Calculate summary statistics
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

// Generate and download sales report as Excel
const downloadExcelReport = async (req, res) => {
    try {
        const filterType = req.query.filterType || 'daily';
        const customStartDate = req.query.startDate;
        const customEndDate = req.query.endDate;
        
        const { startDate, endDate } = getDateRange(filterType, customStartDate, customEndDate);
        
        // Query orders within the date range and with status "Delivered"
        const orders = await Order.find({
            createdAt: { $gte: startDate, $lte: endDate },
            orderStatus: { $in: ['Delivered'] }
        }).populate('user', 'name email');
        
        // Create a new Excel workbook and worksheet
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Sales Report');
        
        // Add title
        worksheet.mergeCells('A1:H1');
        worksheet.getCell('A1').value = 'Prime Sales Report';
        worksheet.getCell('A1').font = { size: 16, bold: true };
        worksheet.getCell('A1').alignment = { horizontal: 'center' };
        
        // Add date range
        worksheet.mergeCells('A2:H2');
        worksheet.getCell('A2').value = `Period: ${formatDate(startDate)} to ${formatDate(endDate)}`;
        worksheet.getCell('A2').font = { size: 12 };
        worksheet.getCell('A2').alignment = { horizontal: 'center' };
        
        // Add summary
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
        
        // Add headers
        worksheet.addRow(['Order ID', 'Customer', 'Date', 'Payment Method', 'Status', 'Subtotal', 'Discount', 'Total']);
        
        // Style the header row
        worksheet.getRow(4).font = { bold: true };
        worksheet.getRow(4).alignment = { horizontal: 'center' };
        
        // Add order data
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
        
        // Style the data
        for (let i = 5; i < 5 + orders.length; i++) {
            worksheet.getRow(i).alignment = { horizontal: 'center' };
        }
        
        // Set column widths
        worksheet.columns.forEach(column => {
            column.width = 15;
        });
        
        // Generate file name
        const fileName = `sales_report_${formatDate(startDate)}_to_${formatDate(endDate)}.xlsx`;
        const filePath = path.join(__dirname, '../../public/downloads', fileName);
        
        // Ensure the directory exists
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        // Write the file
        await workbook.xlsx.writeFile(filePath);
        
        // Send the file
        res.download(filePath, fileName, (err) => {
            if (err) {
                console.error('Error sending file:', err);
                res.status(500).send('Error downloading file');
            }
            
            // Delete the file after sending
            fs.unlink(filePath, (unlinkErr) => {
                if (unlinkErr) console.error('Error deleting file:', unlinkErr);
            });
        });
    } catch (error) {
        console.error('Error generating Excel report:', error);
        res.status(500).send('Failed to generate Excel report');
    }
};

// Generate and download sales report as PDF
const downloadPdfReport = async (req, res) => {
    try {
        const filterType = req.query.filterType || 'daily';
        const customStartDate = req.query.startDate;
        const customEndDate = req.query.endDate;
        
        const { startDate, endDate } = getDateRange(filterType, customStartDate, customEndDate);
        
        // Query orders within the date range and with status "Delivered"
        const orders = await Order.find({
            createdAt: { $gte: startDate, $lte: endDate },
            orderStatus: { $in: ['Delivered'] }
        }).populate('user', 'name email');
        
        // Calculate summary statistics
        let totalSales = 0;
        let totalDiscount = 0;
        orders.forEach(order => {
            totalSales += order.total;
            totalDiscount += order.discount || 0;
        });
        
        // Generate file name
        const fileName = `sales_report_${formatDate(startDate)}_to_${formatDate(endDate)}.pdf`;
        const filePath = path.join(__dirname, '../../public/downloads', fileName);
        
        // Ensure the directory exists
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        // Create a PDF document
        const doc = new PDFDocument({ margin: 30, size: 'A4' });
        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);
        
        // Add title
        doc.fontSize(18).text('Prime Sales Report', { align: 'center' });
        doc.moveDown();
        
        // Add date range
        doc.fontSize(12).text(`Period: ${formatDate(startDate)} to ${formatDate(endDate)}`, { align: 'center' });
        doc.moveDown();
        
        // Add summary
        doc.fontSize(12).text(`Total Orders: ${orders.length} | Total Sales: ₹${totalSales.toFixed(2)} | Total Discount: ₹${totalDiscount.toFixed(2)}`, { align: 'center' });
        doc.moveDown(2);
        
        // Prepare table data
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
        
        // Draw the table
        await doc.table(tableData, {
            prepareHeader: () => doc.font('Helvetica-Bold').fontSize(10),
            prepareRow: () => doc.font('Helvetica').fontSize(10)
        });
        
        // Finalize the PDF
        doc.end();
        
        // Wait for the file to be written
        stream.on('finish', () => {
            // Send the file
            res.download(filePath, fileName, (err) => {
                if (err) {
                    console.error('Error sending file:', err);
                    res.status(500).send('Error downloading file');
                }
                
                // Delete the file after sending
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

module.exports = {
    loadSalesReport,
    downloadExcelReport,
    downloadPdfReport
};
