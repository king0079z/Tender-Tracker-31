import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import compression from 'compression';
import pg from 'pg';
const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Enable gzip compression
app.use(compression());
app.use(express.json());

// Parse Azure connection string if available
const getAzureDbConfig = () => {
  const connectionString = process.env.AZURE_POSTGRESQL_CONNECTIONSTRING;
  if (!connectionString) {
    console.warn('Missing AZURE_POSTGRESQL_CONNECTIONSTRING, falling back to individual config variables');
    return {
      host: process.env.WEBSITE_PRIVATE_IP || process.env.PGHOST || 'tender-tracking-db2.postgres.database.azure.com',
      database: process.env.WEBSITE_DBNAME || process.env.PGDATABASE || 'tender_tracking_db',
      user: process.env.WEBSITE_DBUSER || process.env.PGUSER || 'abouelfetouhm',
      password: process.env.WEBSITE_DBPASSWORD || process.env.PGPASSWORD || process.env.AZURE_POSTGRESQL_PASSWORD,
      port: parseInt(process.env.WEBSITE_DBPORT || process.env.PGPORT || '5432', 10),
      ssl: {
        rejectUnauthorized: false
      }
    };
  }
  
  try {
    // Handle both URL format and connection string format
    const config = connectionString.startsWith('postgres://') 
      ? new URL(connectionString)
      : new URL(`postgres://${connectionString}`);
      
    return {
      host: config.hostname,
      user: config.username,
      password: process.env.WEBSITE_DBPASSWORD || 
                process.env.PGPASSWORD || 
                process.env.AZURE_POSTGRESQL_PASSWORD,
      database: config.pathname.slice(1),
      port: parseInt(config.port || '5432', 10),
      ssl: {
        rejectUnauthorized: false
      }
    };
  } catch (error) {
    console.error('Failed to parse connection string:', error);
    process.exit(1);
  }
};

// Database configuration with connection pool settings
const poolConfig = {
  ...getAzureDbConfig(),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
};

// Create a connection pool
const pool = new Pool(poolConfig);

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to the database:', err);
    process.exit(1);
  }
  console.log('Successfully connected to database');
  release();
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    res.json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
      environment: {
        nodeEnv: process.env.NODE_ENV,
        port: PORT
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Database query endpoint
app.post('/api/query', async (req, res) => {
  let client;
  try {
    const { text, params } = req.body;
    
    if (!text) {
      return res.status(400).json({
        error: true,
        message: 'Query text is required'
      });
    }

    client = await pool.connect();
    const result = await client.query(text, params);
    res.json({
      rows: result.rows,
      rowCount: result.rowCount,
      fields: result.fields
    });
  } catch (error) {
    console.error('Query error:', error);
    res.status(500).json({ 
      error: true,
      message: error.message
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});

// Serve static files
app.use(express.static(join(__dirname)));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down gracefully...');
  if (pool) {
    try {
      await pool.end();
      console.log('Database connection closed');
    } catch (error) {
      console.error('Error closing database connection:', error);
    }
  }
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Environment:', {
    nodeEnv: process.env.NODE_ENV,
    port: PORT,
    dbHost: poolConfig.host,
    dbName: poolConfig.database,
    dbUser: poolConfig.user
  });
});