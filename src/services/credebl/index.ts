import { authService } from './auth';
import { credentialService } from './credentials';
import { verificationService } from './verification';
import { connectionService } from './connection';
import { schemaService } from './schema';
import { agentService } from './agent';
import { emailRegistrationService } from './emailRegistration';
import { emailValidationService } from './emailValidation';
import { generateUserSeed } from './did';

export { authService } from './auth';
export { credentialService } from './credentials';
export { verificationService } from './verification';
export { connectionService } from './connection';
export { schemaService } from './schema';
export { agentService } from './agent';
export { emailRegistrationService } from './emailRegistration';
export { emailValidationService } from './emailValidation';
export { generateUserSeed } from './did';

export * from './types';
export * from './did';

export default {
    auth: authService,
    credentials: credentialService,
    verification: verificationService,
    connections: connectionService,
    schemas: schemaService,
    agents: agentService,
    emailValidation: emailValidationService,
    generateUserSeed,
};
