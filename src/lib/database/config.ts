import { parse } from 'pg-connection-string';

// Parse Azure PostgreSQL connection string
const getConnectionConfig = () => {
  const connectionString = process.env.AZURE_POSTGRESQL_CONNECTIONSTRING;
  
  if (!connectionString) {
    console.error('Missing AZURE_POSTGRESQL_CONNECTIONSTRING environment variable');
    return null;
  }
  
  try {
    const parsedConfig = parse(connectionString);
    return {
      host: parsedConfig.host,
      database: parsedConfig.database,
      user: parsedConfig.user,
      password: process.env.AZURE_POSTGRESQL_PASSWORD || 
               process.env.PGPASSWORD || 
               process.env.WEBSITE_DBPASSWORD,
      port: parseInt(parsedConfig.port || '5432', 10),
      ssl: {
        rejectUnauthorized: false
      }
    };
  } catch (error) {
    console.error('Failed to parse connection string:', error);
    return null;
  }
};

// Azure PostgreSQL configuration
export const dbConfig = {
  ...getConnectionConfig(),
  // Connection pool configuration
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
};

// Validate configuration
export const validateConfig = () => {
  if (!dbConfig.password || typeof dbConfig.password !== 'string') {
    throw new Error(
      'Database password is not properly configured. Please set one of the following environment variables:\n' +
      '- AZURE_POSTGRESQL_PASSWORD\n' +
      '- PGPASSWORD\n' +
      '- WEBSITE_DBPASSWORD'
    );
  }
  
  if (!dbConfig.host || !dbConfig.database || !dbConfig.user) {
    throw new Error('Invalid database configuration. Missing required fields.');
  }
  
  return true;
};