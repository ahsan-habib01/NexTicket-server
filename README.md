# NexTicket - Server

Backend API for TicketBari, an online ticket booking platform for Bus, Train, Launch, and Flight tickets.

## 🔗 Live API
[[Your Server URL Here](https://nex-ticket-server.vercel.app)]

## 🛠️ Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MongoDB with Mongoose
- **Authentication:** Firebase Admin SDK / JWT
- **Payment:** Stripe
- **Image Upload:** ImgBB API
- **Security:** CORS, dotenv, helmet

## 📦 NPM Packages Used

```json
{
  "express": "Server framework",
  "mongodb": "Database driver",
  "mongoose": "MongoDB ODM",
  "cors": "Cross-origin resource sharing",
  "dotenv": "Environment variables",
  "stripe": "Payment processing",
  "jsonwebtoken": "JWT authentication",
  "firebase-admin": "Firebase authentication"
}
```

## ⚙️ Environment Variables

Create a `.env` file in the root directory:

```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
STRIPE_SECRET_KEY=your_stripe_secret_key
JWT_SECRET=your_jwt_secret
FIREBASE_SERVICE_ACCOUNT=your_firebase_credentials_json
```


## 🔐 Security Features

- JWT token verification middleware
- Firebase token validation
- Role-based access control (User, Vendor, Admin)
- Input validation and sanitization
- MongoDB injection prevention
- CORS configuration for specific origins

## 📂 Project Structure

```
server/
├── config/
│   ├── db.js
│   └── firebase.js
├── controllers/
│   ├── authController.js
│   ├── ticketController.js
│   ├── bookingController.js
│   ├── paymentController.js
│   └── adminController.js
├── middleware/
│   ├── auth.js
│   └── roleCheck.js
├── models/
│   ├── User.js
│   ├── Ticket.js
│   ├── Booking.js
│   └── Transaction.js
├── routes/
│   ├── authRoutes.js
│   ├── ticketRoutes.js
│   ├── bookingRoutes.js
│   ├── paymentRoutes.js
│   └── adminRoutes.js
├── utils/
│   └── helpers.js
├── .env
├── .gitignore
├── index.js
└── package.json
```

## 🧪 Testing

Run the server locally and test endpoints using:
- Postman
- Thunder Client (VS Code extension)
- REST Client (VS Code extension)

## 📝 Database Models

### User Schema
- name, email, photoURL, role (user/vendor/admin), isFraud, createdAt

### Ticket Schema
- title, from, to, transportType, price, quantity, departureDateTime, perks, image, vendorEmail, verificationStatus (pending/approved/rejected), isAdvertised

### Booking Schema
- userId, ticketId, quantity, totalPrice, status (pending/accepted/rejected/paid), createdAt

### Transaction Schema
- userId, bookingId, amount, transactionId, paymentDate
