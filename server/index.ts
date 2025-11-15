import express from 'express';
import cors from 'cors'; // 👈 1. Make sure to 'npm install cors'
import { apiRoutes } from './routes';
import { fileRoutes } from './storage';
import { attachVite } from './vite';

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

// === THIS IS THE UPDATED SECTION ===
// Define the URLs that are allowed to make requests to your server
const whiteList = [
  'http://localhost:5173',      // For your local development
  'https://av512406.github.io'  // For your live GitHub Pages site
];

app.use(cors({
  origin: function (origin, callback) {
    // Check if the incoming origin is in our whitelist
    if (!origin || whiteList.indexOf(origin) !== -1) {
      // If it is, allow the request
      callback(null, true);
    } else {
      // If it's not, block the request
      callback(new Error('This origin is not allowed by CORS'));
    }
  },
  credentials: true
}));
// === END OF UPDATED SECTION ===

// --- Other middleware (must come AFTER cors) ---
app.use(express.json()); // Body parser for JSON
app.use(
  express.urlencoded({
    extended: true,
  }),
);

// --- Your API Routes ---
app.use('/api', apiRoutes);
app.use('/file', fileRoutes);

// --- Vite setup for development (this part is ignored in production) ---
if (process.env.NODE_ENV !== 'production') {
  console.log('Attaching Vite middleware in development mode...');
  attachVite(app);
} else {
  // In production, serve the static files (if you had built them here)
  // Since your front-end is on GitHub Pages, this part might just be for the API
  console.log('Running in production mode. API server is live.');
  
  // A simple health check route for your production server
  app.get('/health', (req, res) => {
    res.status(200).send('OK');
  });
}

// --- Start the server ---
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Server is listening on http://0.0.0.0:${port}`);
});
