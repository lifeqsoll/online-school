import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '..', '.env') });
process.env.DEV_EXPOSE_RESET_TOKEN = 'true';
