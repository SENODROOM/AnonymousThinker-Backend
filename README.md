# Anonymous Thinker Backend

A robust Node.js backend API for the Anonymous Thinker platform - enabling users to share thoughts and ideas anonymously in a safe, secure environment.

## 🚀 Overview

Anonymous Thinker Backend is a RESTful API built with Node.js and Express that powers an anonymous thought-sharing platform. The application provides secure endpoints for users to post, read, and interact with anonymous content while maintaining complete privacy.

## ✨ Features

- **Anonymous Post Creation** - Share thoughts without revealing identity
- **Secure Authentication** - JWT-based authentication system
- **Content Management** - CRUD operations for posts and thoughts
- **User Privacy** - Built with privacy-first architecture
- **RESTful API Design** - Clean, scalable API structure
- **Middleware Protection** - Request validation and security layers
- **Database Integration** - Efficient data persistence layer

## 📁 Project Structure

```
AnoymousThinker-Backend/
├── config/              # Configuration files (database, environment)
├── middleware/          # Express middleware (auth, validation, error handling)
├── models/              # Database models and schemas
├── routes/              # API route definitions
├── server.js            # Application entry point
├── package.json         # Dependencies and scripts
├── package-lock.json    # Locked dependency versions
└── .gitignore          # Git ignore rules
```

## 🛠️ Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Authentication**: JWT (JSON Web Tokens)
- **Database**: MongoDB/PostgreSQL (based on configuration)
- **Environment**: dotenv for environment variables

## 📋 Prerequisites

Before running this project, ensure you have:

- Node.js (v14.x or higher)
- npm or yarn package manager
- MongoDB/PostgreSQL database instance
- Git for version control

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/SENODROOM/AnoymousThinker-Backend.git
   cd AnoymousThinker-Backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   # Server Configuration
   PORT=5000
   NODE_ENV=development
   
   # Database Configuration
   DB_URI=your_database_connection_string
   
   # JWT Secret
   JWT_SECRET=your_secret_key_here
   JWT_EXPIRE=7d
   
   # CORS Settings
   CORS_ORIGIN=http://localhost:3000
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```
   
   Or for production:
   ```bash
   npm start
   ```

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user

### Posts/Thoughts
- `GET /api/posts` - Get all posts
- `GET /api/posts/:id` - Get specific post
- `POST /api/posts` - Create new post (Protected)
- `PUT /api/posts/:id` - Update post (Protected)
- `DELETE /api/posts/:id` - Delete post (Protected)

### User Management
- `GET /api/users/profile` - Get user profile (Protected)
- `PUT /api/users/profile` - Update profile (Protected)

> **Note**: Protected routes require JWT token in Authorization header: `Bearer <token>`

## 🔒 Security Features

- **JWT Authentication** - Secure token-based authentication
- **Password Hashing** - Bcrypt encryption for user passwords
- **Input Validation** - Request validation middleware
- **CORS Protection** - Cross-origin resource sharing configuration
- **Rate Limiting** - Protection against brute force attacks
- **Helmet.js** - Security headers implementation
- **XSS Protection** - Cross-site scripting prevention

## 🧪 Testing

Run the test suite:
```bash
npm test
```

Run tests with coverage:
```bash
npm run test:coverage
```

## 📝 Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `PORT` | Server port number | No | 5000 |
| `NODE_ENV` | Environment mode | No | development |
| `DB_URI` | Database connection string | Yes | - |
| `JWT_SECRET` | Secret key for JWT | Yes | - |
| `JWT_EXPIRE` | JWT expiration time | No | 7d |
| `CORS_ORIGIN` | Allowed CORS origins | No | * |

## 🚦 Application Flow

1. **Server Initialization** (`server.js`)
   - Load environment variables
   - Connect to database
   - Initialize middleware
   - Register routes
   - Start server

2. **Request Flow**
   ```
   Request → Middleware → Routes → Controllers → Models → Database
                ↓
   Response ← Middleware ← Controllers ← Models ← Database
   ```

## 📚 Development Guidelines

### Code Style
- Follow ESLint configuration
- Use async/await for asynchronous operations
- Implement proper error handling with try-catch
- Write descriptive commit messages

### Adding New Routes
1. Define route in `routes/` directory
2. Create controller function
3. Add necessary middleware
4. Update API documentation

### Database Models
- Use Mongoose/Sequelize schemas
- Implement proper validation
- Add indexes for frequently queried fields
- Include timestamps

## 🐛 Error Handling

The application uses centralized error handling:

```javascript
// Custom error responses
{
  "success": false,
  "error": "Error message",
  "statusCode": 400
}
```

Common HTTP status codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Server Error

## 🔄 Scripts

```json
{
  "start": "node server.js",
  "dev": "nodemon server.js",
  "test": "jest --watchAll",
  "lint": "eslint .",
  "format": "prettier --write \"**/*.{js,json,md}\""
}
```

## 🚀 Deployment

### Production Checklist
- [ ] Set `NODE_ENV=production`
- [ ] Use production database
- [ ] Configure secure JWT secret
- [ ] Enable HTTPS
- [ ] Set up monitoring and logging
- [ ] Configure CORS properly
- [ ] Enable rate limiting
- [ ] Set up backup strategy

### Deployment Options
- **Heroku**: Simple deployment with Git
- **AWS EC2**: Full server control
- **DigitalOcean**: Droplets with Node.js
- **Vercel**: Serverless deployment
- **Railway**: Modern deployment platform

## 📊 Performance Optimization

- Database indexing for faster queries
- Response caching for frequently accessed data
- Compression middleware for response size reduction
- Database connection pooling
- Load balancing for horizontal scaling

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Contribution Guidelines
- Write clean, documented code
- Add tests for new features
- Update documentation as needed
- Follow existing code style
- Create detailed PR descriptions

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👥 Authors

- **SENODROOM** - *Initial work* - [@SENODROOM](https://github.com/SENODROOM)

## 🙏 Acknowledgments

- Express.js community for the robust framework
- Node.js team for the amazing runtime
- All contributors who help improve this project
- Open source community for inspiration and tools

## 📞 Support

For support, email your-email@example.com or open an issue in the repository.

## 🔮 Roadmap

- [ ] WebSocket integration for real-time updates
- [ ] Advanced search and filtering
- [ ] Content moderation system
- [ ] User reputation system
- [ ] Analytics dashboard
- [ ] Mobile app API endpoints
- [ ] GraphQL API option
- [ ] Microservices architecture migration

## 📈 Version History

- **v1.0.0** - Initial release
  - Basic CRUD operations
  - JWT authentication
  - Anonymous posting feature

---

**Made with ❤️ by SENODROOM**

For more information, visit the [project homepage](https://github.com/SENODROOM/AnoymousThinker-Backend)
