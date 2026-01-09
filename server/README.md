# My Clinic - Backend Server

This directory contains the Node.js, Express, and MongoDB backend for the "My Clinic" application.

## Setup Instructions

### 1. Prerequisites
- Node.js and npm (or yarn) installed.
- MongoDB installed and running locally, or a MongoDB Atlas connection string.

### 2. Install Dependencies
Navigate to this `server` directory and run:
```bash
npm install
```
or
```bash
yarn install
```

### 3. Environment Variables
Create a file named `.env` in the `server` directory. This file will hold your secret keys and connection strings.

Copy the following into your `.env` file and replace the placeholder values:
```
# MongoDB Connection
MONGO_URI=mongodb://localhost:27017/myClinicDB

# JWT Secret for authentication
JWT_SECRET=your_very_secret_jwt_key
JWT_EXPIRE=30d

# Gemini API Key (Optional for development, uses mock data if not set)
API_KEY=your_gemini_api_key_here

# Email configuration (using a service like Mailtrap or SendGrid)
# See nodemailer documentation for options
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_EMAIL=your_smtp_user
SMTP_PASSWORD=your_smtp_password
FROM_EMAIL=noreply@myclinic.com
FROM_NAME=MyClinic
```
- Replace the `MONGO_URI` with your own local or remote MongoDB connection string if it's different.
- The `JWT_SECRET` must be a long, random string for security.
- The `API_KEY` is for Google Gemini. If this is not provided, the server will log a warning and AI features will use mock/placeholder data.

### 3a. Important: MongoDB Replica Set Requirement

**Why is this needed?** The application uses multi-document ACID transactions for all financial operations (e.g., booking appointments, adding funds, processing refunds) to ensure data integrity. MongoDB transactions **require** a replica set configuration. The server will fail to start or transactions will fail if you run it against a standalone MongoDB instance.

**How to set up a local replica set (for development):**

1.  **Stop your MongoDB server** if it's currently running.

2.  **Find your MongoDB data directory (`dbpath`)**. You can find this in your MongoDB configuration file (`mongod.conf`). A common default is `/data/db` on Linux/macOS or `C:\data\db` on Windows.

3.  **Start the MongoDB server with the `--replSet` flag.** Replace `/path/to/your/db` with your actual data directory path.

    ```bash
    mongod --dbpath /path/to/your/db --replSet rs0
    ```

4.  **Open a new terminal window** and connect to your MongoDB instance using the `mongosh` shell:

    ```bash
    mongosh
    ```

5.  **Initiate the replica set** by running the following command inside the `mongosh` shell:

    ```javascript
    rs.initiate()
    ```

    You should see a response with `"ok": 1`. Your command prompt will change to include `rs0 [primary] >`.

Your local MongoDB is now running as a single-node replica set, and the application will be able to perform transactions correctly.

### 4. Seed the Database (One-time setup)
To populate your database with the initial data required for the app to function correctly, run the seed script. This will clear any existing data in the collections and insert the sample data.

Run the following command in the `server` directory:
```bash
npm run seed
```

### 5. Start the Server
You can start the server in two modes:

**For development (with auto-restarting on file changes):**
```bash
npm run dev
```
The server will start, typically on `http://localhost:5000`.

**For production:**
```bash
npm start
```

The server is now running and ready to accept requests from the frontend application.