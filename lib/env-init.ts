// Side-effect module: import it before any AI SDK provider so empty optional vars are unset first.
import { sanitizeEnv } from './env-sanitize';

sanitizeEnv();
