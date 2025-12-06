const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// ============================================
// MIDDLEWARE CONFIGURATION
// ============================================

// CORS Configuration - CRITICAL for deployment
const corsOptions = {
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    // Add your deployed frontend URLs here when deploying
    // 'https://your-netlify-site.netlify.app',
    // 'https://your-vercel-site.vercel.app'
  ],
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json()); // Parse JSON request bodies

// ============================================
// MONGODB CONNECTION
// ============================================

const uri = process.env.MONGODB_URI;

// Create a MongoClient with a MongoClientOptions object
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Function to connect to MongoDB
async function connectDB() {
  try {
    await client.connect();
    console.log('✅ Successfully connected to MongoDB!');
    return client.db('nexticket-db'); // Your database name
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1); // Exit if database connection fails
  }
}

// ============================================
// GLOBAL DATABASE VARIABLE
// ============================================
let db;

// Connect to database when server starts
connectDB().then(database => {
  db = database;
});

// ============================================
// MIDDLEWARE: Verify MongoDB Connection
// ============================================
function checkDBConnection(req, res, next) {
  if (!db) {
    return res.status(503).json({
      success: false,
      message: 'Database connection not established',
    });
  }
  next();
}

// Apply to all routes except root
app.use('/api', checkDBConnection);

// ============================================
// COLLECTIONS - We'll use these throughout
// ============================================
const getCollections = () => ({
  users: db.collection('users'),
  tickets: db.collection('tickets'),
  bookings: db.collection('bookings'),
  transactions: db.collection('transactions'),
});

// ============================================
// API ROUTES
// ============================================

// Root route - Health check
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🚀 Ticket Booking Server is running!',
    timestamp: new Date().toISOString(),
  });
});

// ============================================
// USER ROUTES
// ============================================

// Create or Update User (after Firebase authentication)
app.post('/api/users', async (req, res) => {
  try {
    const user = req.body;
    const { users } = getCollections();

    // Check if user already exists
    const existingUser = await users.findOne({ email: user.email });

    if (existingUser) {
      // Update existing user
      const result = await users.updateOne(
        { email: user.email },
        {
          $set: {
            name: user.name,
            photoURL: user.photoURL,
            updatedAt: new Date(),
          },
        }
      );
      return res.json({
        success: true,
        message: 'User updated successfully',
        data: result,
      });
    }

    // Create new user with default role 'user'
    const newUser = {
      name: user.name,
      email: user.email,
      photoURL: user.photoURL,
      role: 'user', // default role
      isFraud: false, // default for vendors
      createdAt: new Date(),
    };

    const result = await users.insertOne(newUser);
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: result,
    });
  } catch (error) {
    console.error('Error in /api/users POST:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save user',
      error: error.message,
    });
  }
});

// Get User by Email
app.get('/api/users/:email', async (req, res) => {
  try {
    const email = req.params.email;
    const { users } = getCollections();

    const user = await users.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error('Error in /api/users/:email GET:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user',
      error: error.message,
    });
  }
});

// Get All Users (Admin Only - we'll add JWT verification later)
app.get('/api/users', async (req, res) => {
  try {
    const { users } = getCollections();
    const allUsers = await users.find({}).toArray();

    res.json({
      success: true,
      count: allUsers.length,
      data: allUsers,
    });
  } catch (error) {
    console.error('Error in /api/users GET:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message,
    });
  }
});

// ============================================
// TEST ROUTE - Verify MongoDB Collections
// ============================================
app.get('/api/test/collections', async (req, res) => {
  try {
    const collections = await db.listCollections().toArray();
    res.json({
      success: true,
      message: 'Database collections fetched successfully',
      collections: collections.map(col => col.name),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch collections',
      error: error.message,
    });
  }
});

// ============================================
// MORE ROUTES WILL BE ADDED HERE
// ============================================
// We'll add ticket routes, booking routes, etc. step by step

// ============================================
// 404 HANDLER - Must be after all routes
// ============================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// ============================================
// ERROR HANDLING MIDDLEWARE
// ============================================
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// ============================================
// START SERVER
// ============================================
app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
  console.log(`📍 Local: http://localhost:${port}`);
  console.log(`📍 Network: http://192.168.x.x:${port}`);
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
process.on('SIGINT', async () => {
  console.log('\n⏳ Shutting down gracefully...');
  try {
    await client.close();
    console.log('✅ MongoDB connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});
