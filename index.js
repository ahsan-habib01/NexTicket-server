const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

// Middleware Configuration


// CORS Configuration - CRITICAL for deployment
const corsOptions = {
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://nexticket-71fe1.web.app/',
  ],
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json()); // Parse JSON request bodies

// MONGODB CONNECTION

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
    return client.db('nexticket-db');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

// GLOBAL DATABASE VARIABLE
let db;
connectDB().then(database => {
  db = database;
});

// MIDDLEWARE: Verify MongoDB Connection
function checkDBConnection(req, res, next) {
  if (!db) {
    return res.status(503).json({
      success: false,
      message: 'Database connection not established',
    });
  }
  next();
}

app.use('/api', checkDBConnection);

// COLLECTIONS - We'll use these throughout
const getCollections = () => ({
  users: db.collection('users'),
  tickets: db.collection('tickets'),
  bookings: db.collection('bookings'),
  transactions: db.collection('transactions'),
});

// API ROUTES
// Root route 
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🚀 Ticket Booking Server is running!',
    timestamp: new Date().toISOString(),
  });
});

// USER ROUTES
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

// Update User Role (Admin Only)
app.patch('/api/users/:email/role', async (req, res) => {
  try {
    const { email } = req.params;
    const { role } = req.body;
    const { users } = getCollections();

    // Validate role
    if (!['user', 'vendor', 'admin'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be user, vendor, or admin',
      });
    }

    const result = await users.updateOne(
      { email },
      { $set: { role, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      message: `User role updated to ${role}`,
    });
  } catch (error) {
    console.error('Error in /api/users/:email/role PATCH:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user role',
      error: error.message,
    });
  }
});

// Mark Vendor as Fraud (Admin Only)
app.patch('/api/users/:email/fraud', async (req, res) => {
  try {
    const { email } = req.params;
    const { users, tickets } = getCollections();

    // Update user
    const userResult = await users.updateOne(
      { email, role: 'vendor' },
      { $set: { isFraud: true, updatedAt: new Date() } }
    );

    if (userResult.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found',
      });
    }

    // Hide all tickets from this vendor
    await tickets.updateMany(
      { vendorEmail: email },
      { $set: { verificationStatus: 'rejected' } }
    );

    res.json({
      success: true,
      message: 'Vendor marked as fraud and all tickets hidden',
    });
  } catch (error) {
    console.error('Error in /api/users/:email/fraud PATCH:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark vendor as fraud',
      error: error.message,
    });
  }
});

// TEST ROUTE - Verify MongoDB Collections
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


// TICKET ROUTES
// Add New Ticket (Vendor Only)
app.post('/api/tickets', async (req, res) => {
  try {
    const ticketData = req.body;
    const { tickets } = getCollections();

    // Create ticket with initial pending status
    const newTicket = {
      ...ticketData,
      verificationStatus: 'pending', // Admin will approve/reject
      isAdvertised: false, // Not advertised initially
      createdAt: new Date(),
    };

    const result = await tickets.insertOne(newTicket);
    
    res.status(201).json({
      success: true,
      message: 'Ticket added successfully. Waiting for admin approval.',
      data: result,
    });
  } catch (error) {
    console.error('Error in /api/tickets POST:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add ticket',
      error: error.message,
    });
  }
});

// Get Advertised Tickets (For Homepage)
app.get('/api/tickets/advertised', async (req, res) => {
  try {
    const { tickets } = getCollections();

    const advertisedTickets = await tickets
      .find({
        verificationStatus: 'approved',
        isAdvertised: true,
      })
      .limit(6)
      .toArray();

    console.log('📢 Advertised tickets found:', advertisedTickets.length); // Debug log

    res.json({
      success: true,
      data: advertisedTickets,
    });
  } catch (error) {
    console.error('Error in /api/tickets/advertised GET:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch advertised tickets',
      error: error.message,
    });
  }
});

// Get Latest Tickets (For Homepage)
app.get('/api/tickets/latest', async (req, res) => {
  try {
    const { tickets } = getCollections();

    const latestTickets = await tickets
      .find({ verificationStatus: 'approved' })
      .sort({ createdAt: -1 })
      .limit(8)
      .toArray();

    console.log('🆕 Latest tickets found:', latestTickets.length); // Debug log

    res.json({
      success: true,
      data: latestTickets,
    });
  } catch (error) {
    console.error('Error in /api/tickets/latest GET:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch latest tickets',
      error: error.message,
    });
  }
});

// Get Pending Tickets (Admin Only)
app.get('/api/tickets/pending', async (req, res) => {
  try {
    const { tickets } = getCollections();

    const pendingTickets = await tickets
      .find({ verificationStatus: 'pending' })
      .sort({ createdAt: -1 })
      .toArray();

    console.log('📋 Pending tickets found:', pendingTickets.length); // Debug log
    console.log('First ticket:', pendingTickets[0]); // Show first ticket

    res.json({
      success: true,
      count: pendingTickets.length,
      data: pendingTickets,
    });
  } catch (error) {
    console.error('❌ Error in /api/tickets/pending GET:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending tickets',
      error: error.message,
    });
  }
});

// Get ALL Tickets (Admin Only - including pending, approved, rejected)
app.get('/api/tickets/all-admin', async (req, res) => {
  try {
    const { tickets } = getCollections();

    const allTickets = await tickets
      .find({})  // No filter - get everything
      .sort({ createdAt: -1 })
      .toArray();

    console.log('📊 All tickets (admin view):', allTickets.length); // Debug log

    res.json({
      success: true,
      count: allTickets.length,
      data: allTickets,
    });
  } catch (error) {
    console.error('❌ Error in /api/tickets/all-admin GET:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch all tickets',
      error: error.message,
    });
  }
});

// Get Vendor's Tickets
app.get('/api/tickets/vendor/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const { tickets } = getCollections();

    const vendorTickets = await tickets
      .find({ vendorEmail: email })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({
      success: true,
      count: vendorTickets.length,
      data: vendorTickets,
    });
  } catch (error) {
    console.error('Error in /api/tickets/vendor/:email GET:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor tickets',
      error: error.message,
    });
  }
});

// Get All Approved Tickets (Public/Protected)
// Supports search, filter, sort, pagination
app.get('/api/tickets', async (req, res) => {
  try {
    const { tickets } = getCollections();
    
    // Query parameters for search, filter, sort, pagination
    const {
      fromLocation,
      toLocation,
      transportType,
      sortBy, // 'price-low', 'price-high'
      page = 1,
      limit = 9,
    } = req.query;

    // Build query - only approved tickets
    let query = { verificationStatus: 'approved' };

    // Search by location
    if (fromLocation) {
      query.fromLocation = { $regex: fromLocation, $options: 'i' };
    }
    if (toLocation) {
      query.toLocation = { $regex: toLocation, $options: 'i' };
    }

    // Filter by transport type
    if (transportType) {
      query.transportType = transportType;
    }

    // Sort options
    let sort = { createdAt: -1 }; // Default: newest first
    if (sortBy === 'price-low') {
      sort = { pricePerUnit: 1 }; // Low to high
    } else if (sortBy === 'price-high') {
      sort = { pricePerUnit: -1 }; // High to low
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Execute query
    const allTickets = await tickets
      .find(query)
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .toArray();

    // Get total count for pagination
    const totalCount = await tickets.countDocuments(query);

    res.json({
      success: true,
      data: allTickets,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalCount / limitNum),
        totalTickets: totalCount,
        ticketsPerPage: limitNum,
      },
    });
  } catch (error) {
    console.error('Error in /api/tickets GET:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tickets',
      error: error.message,
    });
  }
});

// Get Single Ticket by ID
app.get('/api/tickets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { tickets } = getCollections();

    // Validate ObjectId
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ticket ID',
      });
    }

    const ticket = await tickets.findOne({ _id: new ObjectId(id) });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found',
      });
    }

    res.json({
      success: true,
      data: ticket,
    });
  } catch (error) {
    console.error('Error in /api/tickets/:id GET:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ticket',
      error: error.message,
    });
  }
});

// Update Ticket (Vendor Only)
app.patch('/api/tickets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const { tickets } = getCollections();

    // Validate ObjectId
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ticket ID',
      });
    }

    // Remove fields that shouldn't be updated directly
    delete updateData._id;
    delete updateData.verificationStatus;
    delete updateData.isAdvertised;
    delete updateData.vendorEmail;

    const result = await tickets.updateOne(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          ...updateData,
          updatedAt: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found',
      });
    }

    res.json({
      success: true,
      message: 'Ticket updated successfully',
      data: result,
    });
  } catch (error) {
    console.error('Error in /api/tickets/:id PATCH:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update ticket',
      error: error.message,
    });
  }
});

// Delete Ticket (Vendor Only)
app.delete('/api/tickets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { tickets } = getCollections();

    // Validate ObjectId
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ticket ID',
      });
    }

    const result = await tickets.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found',
      });
    }

    res.json({
      success: true,
      message: 'Ticket deleted successfully',
    });
  } catch (error) {
    console.error('Error in /api/tickets/:id DELETE:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete ticket',
      error: error.message,
    });
  }
});

// Verify Ticket (Admin Only) - Approve or Reject
app.patch('/api/tickets/:id/verify', async (req, res) => {
  try {
    const { id } = req.params;
    const { verificationStatus } = req.body; // 'approved' or 'rejected'
    const { tickets } = getCollections();

    // Validate ObjectId
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ticket ID',
      });
    }

    // Validate status
    if (!['approved', 'rejected'].includes(verificationStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification status. Must be "approved" or "rejected"',
      });
    }

    const result = await tickets.updateOne(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          verificationStatus,
          verifiedAt: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found',
      });
    }

    res.json({
      success: true,
      message: `Ticket ${verificationStatus} successfully`,
      data: result,
    });
  } catch (error) {
    console.error('Error in /api/tickets/:id/verify PATCH:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify ticket',
      error: error.message,
    });
  }
});

// Toggle Advertise (Admin Only)
app.patch('/api/tickets/:id/advertise', async (req, res) => {
  try {
    const { id } = req.params;
    const { isAdvertised } = req.body;
    const { tickets } = getCollections();

    // Validate ObjectId
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ticket ID',
      });
    }

    // If trying to advertise, check if already have 6 advertised
    if (isAdvertised) {
      const advertisedCount = await tickets.countDocuments({ 
        isAdvertised: true,
        verificationStatus: 'approved'
      });

      if (advertisedCount >= 6) {
        return res.status(400).json({
          success: false,
          message: 'Cannot advertise more than 6 tickets. Please unadvertise one first.',
        });
      }
    }

    const result = await tickets.updateOne(
      { 
        _id: new ObjectId(id),
        verificationStatus: 'approved' // Only approved tickets can be advertised
      },
      { 
        $set: { 
          isAdvertised,
          advertisedAt: isAdvertised ? new Date() : null
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found or not approved',
      });
    }

    res.json({
      success: true,
      message: `Ticket ${isAdvertised ? 'advertised' : 'unadvertised'} successfully`,
      data: result,
    });
  } catch (error) {
    console.error('Error in /api/tickets/:id/advertise PATCH:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update advertisement status',
      error: error.message,
    });
  }
});


// BOOKING ROUTES
// Create Booking (User Only)
app.post('/api/bookings', async (req, res) => {
  try {
    const bookingData = req.body;
    const { bookings } = getCollections();

    console.log('📝 Creating booking:', bookingData); // Debug log

    const newBooking = {
      ...bookingData,
      createdAt: new Date(),
    };

    const result = await bookings.insertOne(newBooking);

    console.log('✅ Booking created with ID:', result.insertedId); // Debug log

    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      data: result,
    });
  } catch (error) {
    console.error('❌ Error in /api/bookings POST:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create booking',
      error: error.message,
    });
  }
});

// Get User's Bookings
app.get('/api/bookings/user/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const { bookings } = getCollections();

    const userBookings = await bookings
      .find({ userEmail: email })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({
      success: true,
      count: userBookings.length,
      data: userBookings,
    });
  } catch (error) {
    console.error('Error in /api/bookings/user/:email GET:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user bookings',
      error: error.message,
    });
  }
});

// Get Vendor's Booking Requests
app.get('/api/bookings/vendor/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const { bookings } = getCollections();

    const vendorBookings = await bookings
      .find({ vendorEmail: email })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({
      success: true,
      count: vendorBookings.length,
      data: vendorBookings,
    });
  } catch (error) {
    console.error('Error in /api/bookings/vendor/:email GET:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor bookings',
      error: error.message,
    });
  }
});

// Accept Booking (Vendor Only)
app.patch('/api/bookings/:id/accept', async (req, res) => {
  try {
    const { id } = req.params;
    const { bookings } = getCollections();

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid booking ID',
      });
    }

    const result = await bookings.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: 'accepted',
          acceptedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    res.json({
      success: true,
      message: 'Booking accepted successfully',
    });
  } catch (error) {
    console.error('Error in /api/bookings/:id/accept PATCH:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to accept booking',
      error: error.message,
    });
  }
});

// Reject Booking (Vendor Only)
app.patch('/api/bookings/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { bookings } = getCollections();

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid booking ID',
      });
    }

    const result = await bookings.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: 'rejected',
          rejectedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    res.json({
      success: true,
      message: 'Booking rejected successfully',
    });
  } catch (error) {
    console.error('Error in /api/bookings/:id/reject PATCH:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject booking',
      error: error.message,
    });
  }
});

// Update Booking to Paid (after Stripe payment)
app.patch('/api/bookings/:id/pay', async (req, res) => {
  try {
    const { id } = req.params;
    const { transactionId } = req.body;
    const { bookings, tickets } = getCollections();

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid booking ID',
      });
    }

    // Get booking details
    const booking = await bookings.findOne({ _id: new ObjectId(id) });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    // Update booking status to paid
    await bookings.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: 'paid',
          transactionId,
          paidAt: new Date(),
        },
      }
    );

    // Reduce ticket quantity
    await tickets.updateOne(
      { _id: new ObjectId(booking.ticketId) },
      {
        $inc: { quantity: -booking.bookingQuantity },
      }
    );

    res.json({
      success: true,
      message: 'Payment recorded successfully',
    });
  } catch (error) {
    console.error('Error in /api/bookings/:id/pay PATCH:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record payment',
      error: error.message,
    });
  }
});


// STATS ROUTES
// Get Vendor Stats
app.get('/api/stats/vendor/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const { bookings, tickets } = getCollections();

    // Get all paid bookings for this vendor
    const paidBookings = await bookings
      .find({ vendorEmail: email, status: 'paid' })
      .toArray();

    // Calculate total revenue
    const totalRevenue = paidBookings.reduce(
      (sum, booking) => sum + booking.totalPrice,
      0
    );

    // Calculate total tickets sold
    const totalTicketsSold = paidBookings.reduce(
      (sum, booking) => sum + booking.bookingQuantity,
      0
    );

    // Count total tickets added by vendor
    const totalTicketsAdded = await tickets.countDocuments({
      vendorEmail: email,
    });

    // Count pending bookings
    const pendingBookings = await bookings.countDocuments({
      vendorEmail: email,
      status: 'pending',
    });

    res.json({
      success: true,
      data: {
        totalRevenue,
        totalTicketsSold,
        totalTicketsAdded,
        pendingBookings,
      },
    });
  } catch (error) {
    console.error('Error in /api/stats/vendor/:email GET:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor stats',
      error: error.message,
    });
  }
});

// Create Payment Intent
app.post('/api/create-payment-intent', async (req, res) => {
  try {
    const { amount } = req.body; // amount in BDT

    // Create payment intent 
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to paisa
      currency: 'bdt',
      automatic_payment_methods: {
        enabled: true,
      },
    });

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment intent',
      error: error.message,
    });
  }
});

// Save Transaction
app.post('/api/transactions', async (req, res) => {
  try {
    const transactionData = req.body;
    const { transactions } = getCollections();

    const newTransaction = {
      ...transactionData,
      createdAt: new Date(),
    };

    const result = await transactions.insertOne(newTransaction);

    res.status(201).json({
      success: true,
      message: 'Transaction saved successfully',
      data: result,
    });
  } catch (error) {
    console.error('Error in /api/transactions POST:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save transaction',
      error: error.message,
    });
  }
});

// Get User Transactions
app.get('/api/transactions/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const { transactions } = getCollections();

    const userTransactions = await transactions
      .find({ userEmail: email })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({
      success: true,
      count: userTransactions.length,
      data: userTransactions,
    });
  } catch (error) {
    console.error('Error in /api/transactions/:email GET:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions',
      error: error.message,
    });
  }
});

// 404 HANDLER 
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// ERROR HANDLING MIDDLEWARE
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// START SERVER
app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});

// GRACEFUL SHUTDOWN
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
