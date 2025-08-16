#!/bin/bash

# Pool Monitor Deployment Script for Ubuntu Server
# This script sets up the environment and deploys the application using PM2

set -e

echo "🚀 Starting Pool Monitor deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_error "This script should not be run as root"
   exit 1
fi

# Update system packages
print_status "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js and npm (if not already installed)
if ! command -v node &> /dev/null; then
    print_status "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    print_status "Node.js is already installed"
fi

# Install PM2 globally
print_status "Installing PM2..."
sudo npm install -g pm2

# Install pnpm (if not already installed)
if ! command -v pnpm &> /dev/null; then
    print_status "Installing pnpm..."
    sudo npm install -g pnpm
else
    print_status "pnpm is already installed"
fi

# Create logs directory
print_status "Creating logs directory..."
mkdir -p logs

# Install dependencies
print_status "Installing project dependencies..."
pnpm install

# Build the project
print_status "Building the project..."
pnpm run build

# Check if .env file exists
if [ ! -f .env ]; then
    print_warning ".env file not found. Creating from template..."
    cp env.example .env
    print_warning "Please edit .env file with your configuration before starting the application"
    print_warning "Required environment variables:"
    print_warning "  - ADMIN_PRIVATE_KEY"
    print_warning "  - ADMIN_PUBLIC_KEY"
    print_warning "  - LLC_TOKEN_MINT"
    print_warning "  - Other Solana configuration"
fi

# Start the application with PM2
print_status "Starting application with PM2..."
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
print_status "Saving PM2 configuration..."
pm2 save

# Setup PM2 to start on system boot
print_status "Setting up PM2 startup script..."
pm2 startup

print_status "Deployment completed successfully!"
print_status "Application is running on port 8000"
print_status ""
print_status "Useful PM2 commands:"
print_status "  pm2 status          - Check application status"
print_status "  pm2 logs            - View application logs"
print_status "  pm2 restart all     - Restart all applications"
print_status "  pm2 stop all        - Stop all applications"
print_status "  pm2 delete all      - Remove all applications from PM2"
print_status ""
print_status "To view real-time logs: pm2 logs pool-monitor"
print_status "To restart the app: pm2 restart pool-monitor"
