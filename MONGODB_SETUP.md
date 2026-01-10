# MongoDB Atlas Setup Documentation

## Overview

Digital Arcana uses MongoDB Atlas to store pre-sorted card packs for the marketplace. The MongoDB database is used for:
- Storing randomly generated card packs (collections of 7 NFT token IDs)
- Tracking pack purchase status (sold/pending)
- Managing pack inventory for the marketplace

## Database Structure

### Database Name
`packs`

### Collections
Collections are named by set and minting combination:
- Format: `{set} - {minting}` (e.g., "rws - alpha")
- Each collection contains documents representing card packs

### Document Schema
```javascript
{
  _id: ObjectId,           // Auto-generated MongoDB ID
  tokenIds: [number],      // Array of 7 token IDs (NFT card IDs)
  sold: {                  // Set when pack is sold
    date: string,
    hash: string,          // Tezos transaction hash
    to: string,            // Buyer's wallet address
    amount: number         // Price in mutez
  } || null,
  pending: number || null  // Timestamp when pack was marked pending (expires after 5 min)
}
```

## Connection Configuration

### Development Environment
In development mode (`NODE_ENV=development`), MongoDB connection is loaded from:
```
/private/mongodb.js
```

Expected structure:
```javascript
module.exports = {
  uri: "mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority"
};
```

### Production Environment
In production (Qovery deployment), MongoDB connection is loaded from environment variable:
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority
```

## Code References

### Files Using MongoDB
1. `/home/aleiby/projects/da-app/src/marketplace.ts` - Pack purchasing logic (openPack function)
2. `/home/aleiby/projects/da-app/src/admin.ts` - Set minting logic (mintSet function)

### Connection Pattern
```typescript
import { MongoClient } from "mongodb";

// Get connection URI based on environment
let mongodbUri;
if (isDevelopment) {
    const mongodb = require("../private/mongodb");
    mongodbUri = mongodb.uri;
} else {
    mongodbUri = process.env.MONGODB_URI;
}

// Create client and connect
const mongoClient = new MongoClient(mongodbUri);
await mongoClient.connect();
const db = mongoClient.db("packs");
const collection = db.collection(name);

// ... operations ...

await mongoClient.close();
```

## MongoDB Atlas Account Requirements

### Cluster Setup
1. MongoDB Atlas account (free tier M0 is sufficient for development)
2. Cluster created with network access configured
3. Database user with read/write permissions

### Network Access
- Allow connections from your development IP address
- For production (Qovery), allow connections from Qovery's IP ranges or use 0.0.0.0/0

### Database User
- Username and password for database authentication
- Read/write access to `packs` database

## Connection URI Format

Standard MongoDB Atlas connection string:
```
mongodb+srv://<username>:<password>@<cluster-address>/<database>?retryWrites=true&w=majority
```

Example:
```
mongodb+srv://dauser:SecurePassword123@cluster0.abc123.mongodb.net/packs?retryWrites=true&w=majority
```

## Setup Steps

### 1. Create MongoDB Atlas Account
- Go to https://www.mongodb.com/cloud/atlas
- Sign up for free account
- Create a new project (e.g., "Digital Arcana")

### 2. Create Cluster
- Click "Build a Database"
- Choose free tier (M0)
- Select cloud provider and region
- Name your cluster (e.g., "da-cluster")

### 3. Create Database User
- Go to Database Access
- Add new database user
- Set username and password
- Grant "Read and write to any database" role

### 4. Configure Network Access
- Go to Network Access
- Add IP Address
- For development: Add your current IP
- For production: Configure based on hosting provider

### 5. Get Connection String
- Go to Databases
- Click "Connect" on your cluster
- Choose "Connect your application"
- Copy the connection string
- Replace `<password>` with your database user password
- Replace `<database>` with `packs` (or omit to use default)

### 6. Configure Application

For development, create `/private/mongodb.js`:
```javascript
module.exports = {
  uri: "mongodb+srv://username:password@cluster.mongodb.net/packs?retryWrites=true&w=majority"
};
```

For production, set environment variable:
```bash
export MONGODB_URI="mongodb+srv://username:password@cluster.mongodb.net/packs?retryWrites=true&w=majority"
```

## Testing Connection

To verify your MongoDB connection works, you can run a simple test:

```typescript
import { MongoClient } from "mongodb";

const uri = "your-connection-string-here";
const client = new MongoClient(uri);

async function testConnection() {
  try {
    await client.connect();
    console.log("Connected successfully to MongoDB Atlas!");

    const db = client.db("packs");
    const collections = await db.listCollections().toArray();
    console.log("Collections:", collections);

  } catch (error) {
    console.error("Connection failed:", error);
  } finally {
    await client.close();
  }
}

testConnection();
```

## Security Notes

1. **Never commit** `/private/mongodb.js` to git (already in .gitignore)
2. **Use strong passwords** for database users
3. **Restrict network access** to known IP addresses when possible
4. **Rotate credentials** periodically
5. **Use environment variables** in production (not hardcoded values)

## Related Files

- `/home/aleiby/projects/da-app/src/marketplace.ts` - Uses MongoDB for pack purchasing
- `/home/aleiby/projects/da-app/src/admin.ts` - Uses MongoDB for pack generation during minting
- `/home/aleiby/projects/da-app/.gitignore` - Excludes `/private` directory from git
- `/home/aleiby/projects/da-app/package.json` - Includes `mongodb` package dependency

## Next Steps

1. Verify MongoDB Atlas account exists and is accessible
2. Get connection URI from Atlas dashboard
3. Create `/private/mongodb.js` file with connection URI
4. Test connection by running minting or marketplace operations
5. Set `MONGODB_URI` environment variable for production deployment
