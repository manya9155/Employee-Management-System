require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("MongoDB Connected"))
    .catch(err => console.log(err));

// User Schema
const UserSchema = new mongoose.Schema({
    email: String,
    username: String,
    password: String,
    department: String,
    role: { type: String, enum: ["admin", "employee"], default: "employee" } // Default role is Employee
});
const User = mongoose.model('User', UserSchema);

// Department Schema
const DepartmentSchema = new mongoose.Schema({
    name: String,
    employees: [{ type: String }]
});
const Department = mongoose.model('Department', DepartmentSchema);

// Subfunction Schema
const SubFunctionSchema = new mongoose.Schema({
    name: String,
    problemStatement: String,
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' }
});
const SubFunction = mongoose.model('SubFunction', SubFunctionSchema);

// Business Unit Schema
const BusinessUnitSchema = new mongoose.Schema({
    name: String,
    targetSales: Number,
    timePeriod: String,
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' }
});
const BusinessUnit = mongoose.model('BusinessUnit', BusinessUnitSchema);

// Vendor Schema
const VendorSchema = new mongoose.Schema({
    name: String,
    product: String
});
const Vendor = mongoose.model('Vendor', VendorSchema);


// Registration Endpoint
app.post('/register', async (req, res) => {
    const { email, username, password, department } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
        const newUser = new User({ email, username, password: hashedPassword, department, role: "employee" });
        await newUser.save();
        res.status(201).json({ message: "Employee Registered Successfully" });
    } catch (error) {
        res.status(500).json({ message: "Error registering user" });
    }
});
// Login Endpoint
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user) return res.status(400).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "1h" });

    console.log(`User Logged In: ${username}, Role: ${user.role}`); // Debugging

    res.json({ message: "Login successful", token, role: user.role });
});

// Create a department & assign employees
app.post('/departments', async (req, res) => {
    const { name, employeeIds } = req.body;
    try {
        const department = new Department({ name, employees: employeeIds });
        await department.save();
        res.status(201).json({ message: "Department Created", department });
    } catch (err) {
        res.status(500).json({ message: "Error creating department" });
    }
});

// Get all departments
app.get('/departments', async (req, res) => {
    const departments = await Department.find().populate('employees', 'username email');
    res.json(departments);
});

// Add employee to department
app.put('/departments/:deptName/add-employee', async (req, res) => {
    const { username } = req.body;

    try {
        // Find the department by name
        const department = await Department.findOne({ name: req.params.deptName });
        if (!department) return res.status(404).json({ message: "Department not found" });

        // Find the employee by username
        const employee = await User.findOne({ username });
        if (!employee) return res.status(404).json({ message: "Employee not found" });

        // Check if employee is already in the department
        if (department.employees.includes(employee.username)) {
            return res.status(400).json({ message: "Employee already in this department" });
        }

        // Add employee (using username)
        department.employees.push(employee.username);
        await department.save();

        res.json({ message: `Employee ${username} added to department ${department.name}` });
    } catch (error) {
        console.error("Error adding employee:", error);  // Log full error
        res.status(500).json({ message: "Error adding employee", error: error.message });
    }
});

// Remove employee from department
app.put('/departments/:deptName/remove-employee', async (req, res) => {
    const { username } = req.body;

    try {
        // Find the department by name
        const department = await Department.findOne({ name: req.params.deptName });
        if (!department) return res.status(404).json({ message: "Department not found" });

        // Check if the employee exists in the department
        if (!department.employees.includes(username)) {
            return res.status(400).json({ message: "Employee not found in this department" });
        }

        // Remove the employee (using username)
        department.employees = department.employees.filter(emp => emp !== username);
        await department.save();

        res.json({ message: `Employee ${username} removed from department ${department.name}` });
    } catch (error) {
        res.status(500).json({ message: "Error removing employee" });
    }
});

// Create sub-function & assign department
app.post('/subfunctions', async (req, res) => {
    const { name, problemStatement, departmentId } = req.body;
    try {
        const subFunction = new SubFunction({ name, problemStatement, department: departmentId });
        await subFunction.save();
        res.status(201).json({ message: "Sub-function Created", subFunction });
    } catch (err) {
        res.status(500).json({ message: "Error creating sub-function" });
    }
});

// Update problem statement for a subfunction
app.put('/subfunctions/:name', async (req, res) => {
    const { problemStatement } = req.body;
    try {
        const subFunction = await SubFunction.findOneAndUpdate(
            { name: req.params.name },  // Find by name
            { problemStatement },
            { new: true }
        );
        if (!subFunction) return res.status(404).json({ message: "Subfunction not found" });
        res.json({ message: "Subfunction updated", subFunction });
    } catch (error) {
        console.error(" Error updating subfunction:", error);
        res.status(500).json({ message: "Error updating subfunction", error: error.message });
    }
});

// Delete a subfunction
app.delete('/subfunctions/:name', async (req, res) => {
    try {
        const deletedSubFunction = await SubFunction.findOneAndDelete({ name: req.params.name });
        if (!deletedSubFunction) return res.status(404).json({ message: "Subfunction not found" });
        res.json({ message: "Subfunction deleted successfully" });
    } catch (error) {
        console.error(" Error deleting subfunction:", error);
        res.status(500).json({ message: "Error deleting subfunction", error: error.message });
    }
});


// Create Business Unit
app.post('/business-units', async (req, res) => {
    const { name, targetSales, timePeriod, departmentId } = req.body;
    try {
        const businessUnit = new BusinessUnit({ name, targetSales, timePeriod, department: departmentId });
        await businessUnit.save();
        res.status(201).json({ message: "Business Unit Created", businessUnit });
    } catch (err) {
        res.status(500).json({ message: "Error creating business unit" });
    }
});

// Update target sales and time period for a business unit
app.put('/business-units/:name', async (req, res) => {
    const { targetSales, timePeriod } = req.body;
    try {
        const businessUnit = await BusinessUnit.findOneAndUpdate(
            { name: req.params.name },  // Find by name
            { targetSales, timePeriod },
            { new: true }
        );
        if (!businessUnit) return res.status(404).json({ message: "Business unit not found" });
        res.json({ message: "Business unit updated", businessUnit });
    } catch (error) {
        console.error(" Error updating business unit:", error);
        res.status(500).json({ message: "Error updating business unit", error: error.message });
    }
});

// Delete a business unit
app.delete('/business-units/:name', async (req, res) => {
    try {
        const deletedBusinessUnit = await BusinessUnit.findOneAndDelete({ name: req.params.name });
        if (!deletedBusinessUnit) return res.status(404).json({ message: "Business unit not found" });
        res.json({ message: "Business unit deleted successfully" });
    } catch (error) {
        console.error(" Error deleting business unit:", error);
        res.status(500).json({ message: "Error deleting business unit", error: error.message });
    }
});


// Create Vendor
app.post('/vendors', async (req, res) => {
    const { name, product } = req.body;
    try {
        const vendor = new Vendor({ name, product });
        await vendor.save();
        res.status(201).json({ message: "Vendor Created", vendor });
    } catch (err) {
        res.status(500).json({ message: "Error creating vendor" });
    }
});

// Update vendor product
// Update vendor product
app.put('/vendors/:name', async (req, res) => {
    const { product } = req.body;
    try {
        const vendor = await Vendor.findOneAndUpdate(
            { name: req.params.name },  // Find by name
            { product },
            { new: true }
        );
        if (!vendor) return res.status(404).json({ message: "Vendor not found" });
        res.json({ message: "Vendor updated", vendor });
    } catch (error) {
        console.error(" Error updating vendor:", error);
        res.status(500).json({ message: "Error updating vendor", error: error.message });
    }
});

// Delete a vendor
app.delete('/vendors/:name', async (req, res) => {
    try {
        const deletedVendor = await Vendor.findOneAndDelete({ name: req.params.name });
        if (!deletedVendor) return res.status(404).json({ message: "Vendor not found" });
        res.json({ message: "Vendor deleted successfully" });
    } catch (error) {
        console.error(" Error deleting vendor:", error);
        res.status(500).json({ message: "Error deleting vendor", error: error.message });
    }
});

app.get('/database-visualization', async (req, res) => {
    try {
        const businessUnits = await BusinessUnit.find();
        const vendors = await Vendor.find();
        const subfunctions = await SubFunction.find();

        res.json({ businessUnits, vendors, subfunctions });
    } catch (error) {
        console.error(" Error fetching database data:", error);
        res.status(500).json({ message: "Error fetching database data", error: error.message });
    }
});

app.get('/admin-visualization', async (req, res) => {
    try {
        const users = await User.find({}, { username: 1, email: 1, role: 1, department: 1, _id: 0 });
        const departments = await Department.find().populate('employees', 'username email');

        res.json({ users, departments });
    } catch (error) {
        console.error(" Error fetching admin visualization data:", error);
        res.status(500).json({ message: "Error fetching admin visualization data", error: error.message });
    }
});

const ExcelJS = require('exceljs');
const fs = require('fs');

app.get('/export-users', async (req, res) => {
    try {
        const users = await User.find({}, { username: 1, email: 1, role: 1, department: 1, _id: 0 });

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Users');

        // Define columns
        worksheet.columns = [
            { header: 'Username', key: 'username', width: 20 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'Role', key: 'role', width: 15 },
            { header: 'Department', key: 'department', width: 20 }
        ];

        // Add users to the worksheet
        users.forEach(user => {
            worksheet.addRow(user);
        });

        // Set response headers
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=Users.xlsx');

        // Send the file
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error(" Error exporting users:", error);
        res.status(500).json({ message: "Error exporting users", error: error.message });
    }
});

app.post('/update-critical-system', async (req, res) => {
    try {
        const { system, maxDowntime, recoveryBuffer, priority, calculatedRTO } = req.body;

        const db = client.db("test");
        const collection = db.collection("criticalSystems");

        const result = await collection.updateOne(
            { system: system },  // Find by system name
            { $set: { maxDowntime, recoveryBuffer, priority, calculatedRTO } },
            { upsert: true }  // Creates if it doesn't exist
        );

        res.json({ success: true, message: "RTO Updated!" });
    } catch (error) {
        console.error(" Error updating system:", error);
        res.status(500).json({ message: "Error updating system", error: error.message });
    }
});


app.get('/get-critical-systems', async (req, res) => {
    try {
        const db = client.db("test");
        const collection = db.collection("criticalSystems");
        const systems = await collection.find({}).toArray();

        res.json(systems);
    } catch (error) {
        console.error(" Error fetching systems:", error);
        res.status(500).json({ message: "Error fetching data", error: error.message });
    }
});

app.get('/export-critical-systems', async (req, res) => {
    try {
        const criticalSystems = await db.collection('criticalSystems').find().toArray();

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Critical Systems');

        // Define columns
        worksheet.columns = [
            { header: 'System Name', key: 'system', width: 25 },
            { header: 'Impact of Downtime', key: 'impact', width: 40 },
            { header: 'Max Downtime (MAD)', key: 'mad', width: 15 },
            { header: 'Recovery Buffer', key: 'buffer', width: 15 },
            { header: 'Priority', key: 'priority', width: 15 },
            { header: 'Calculated RTO', key: 'rto', width: 15 }
        ];

        // Add rows from database
        criticalSystems.forEach(system => {
            worksheet.addRow(system);
        });

        // Set response headers
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=Critical_Systems_Analysis.xlsx');

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error("❌ Error exporting critical systems:", error);
        res.status(500).json({ message: "Error exporting critical systems", error: error.message });
    }
});


app.get('/critical-systems-config', async (req, res) => {
    try {
        const criticalSystems = [
            { system: "Order Management", impact: "High revenue loss, operational halt", mad: 1, buffer: 1, priority: 1, rto: 2 },
            { system: "Inventory Management", impact: "Stock mismanagement, delivery delays", mad: 3, buffer: 1, priority: 1.5, rto: 4 },
            { system: "Customer Support", impact: "Customer dissatisfaction, support backlog", mad: 0.5, buffer: 0.5, priority: 1, rto: 1 }
        ];
        res.json({ criticalSystems });
    } catch (error) {
        console.error(" Error fetching critical systems config:", error);
        res.status(500).json({ message: "Error fetching critical systems config", error: error.message });
    }
});

app.put('/update-rto', async (req, res) => {
    try {
        const { system, mad, buffer, priority, rto } = req.body;

        // Update the database with the new RTO value
        await db.collection('criticalSystems').updateOne(
            { system: system },
            { $set: { mad, buffer, priority, rto } },
            { upsert: true } // Create entry if it doesn't exist
        );

        res.json({ message: "RTO updated successfully!", rto });
    } catch (error) {
        console.error("❌ Error updating RTO:", error);
        res.status(500).json({ message: "Error updating RTO", error: error.message });
    }
});



async function createAdmin() {
    const adminExists = await User.findOne({ role: "admin" });
    if (!adminExists) {
        const hashedPassword = await bcrypt.hash("admin123", 10);
        const admin = new User({
            email: "admin@example.com",
            username: "admin",
            password: hashedPassword,
            role: "admin"
        });
        await admin.save();
        console.log("Admin account created: admin@example.com / admin123");
    }
}
createAdmin();

// Start Server
app.listen(5000, () => console.log("Server running on port 5000"));
