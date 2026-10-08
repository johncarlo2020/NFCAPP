import { exec } from 'child_process';
import { promisify } from 'util';
import { platform } from 'os';

const execAsync = promisify(exec);

async function installPrerequisites() {
    console.log('🔧 Installing prerequisites for ACR122 RFID reader...\n');
    
    const os = platform();
    
    try {
        if (os === 'win32') {
            console.log('📦 Installing Windows prerequisites...');
            
            console.log('ℹ️  For Windows, you need:');
            console.log('  1. Python 3 available to node-gyp');
            console.log('  2. Visual Studio Build Tools with the "Desktop development with C++" workload');
            console.log('  3. PC/SC driver (usually pre-installed on Windows)');
            console.log('  4. ACR122U driver from ACS website');
            console.log('Install Python and Visual Studio Build Tools before continuing if they are missing.\n');
            
        } else if (os === 'darwin') {
            console.log('📦 Installing macOS prerequisites...');
            console.log('ℹ️  Installing pcsclite (via Homebrew if available)...');
            
            try {
                await execAsync('brew install pcsc-lite');
                console.log('✅ pcsc-lite installed via Homebrew\n');
            } catch (err) {
                console.log('⚠️  Homebrew not found or failed to install pcsc-lite');
                console.log('   Please install Homebrew from https://brew.sh/');
                console.log('   Then run: brew install pcsc-lite\n');
            }
            
        } else if (os === 'linux') {
            console.log('📦 Installing Linux prerequisites...');
            console.log('ℹ️  Attempting to install pcscd and libpcsclite...');
            
            try {
                // Try apt-get first (Debian/Ubuntu)
                await execAsync('sudo apt-get update && sudo apt-get install -y pcscd libpcsclite-dev');
                console.log('✅ pcscd and libpcsclite installed\n');
            } catch (err) {
                console.log('⚠️  apt-get failed. If using different distro, install manually:');
                console.log('   Fedora/RHEL: sudo dnf install pcsc-lite pcsc-lite-devel');
                console.log('   Arch: sudo pacman -S pcsclite\n');
            }
            
            // Start pcscd service
            try {
                await execAsync('sudo systemctl start pcscd');
                await execAsync('sudo systemctl enable pcscd');
                console.log('✅ pcscd service started and enabled\n');
            } catch (err) {
                console.log('⚠️  Could not start pcscd service automatically');
            }
        }
        
        // Install npm dependencies
        console.log('📦 Installing Node.js dependencies...');
        await execAsync('npm install', { cwd: process.cwd() });
        console.log('✅ Dependencies installed successfully\n');
        
        console.log('✨ Setup complete!');
        console.log('\n📝 Next steps:');
        console.log('   1. Connect your ACR122 RFID reader');
        console.log('   2. Run: npm start');
        console.log('   3. The server will start on http://localhost:3001\n');
        
    } catch (error) {
        console.error('❌ Error during installation:', error.message);
        console.log('\n🔧 Manual installation may be required.');
        console.log('   Please check the documentation for your operating system.\n');
        process.exit(1);
    }
}

// Run installation
installPrerequisites();
