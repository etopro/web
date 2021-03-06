import {
    Component,
} from '@angular/core';

import { ToasterService } from 'angular2-toaster';
import { Angulartics2 } from 'angulartics2';

import { ApiService } from 'jslib/abstractions/api.service';
import { CryptoService } from 'jslib/abstractions/crypto.service';
import { I18nService } from 'jslib/abstractions/i18n.service';
import { MessagingService } from 'jslib/abstractions/messaging.service';

import { EmailRequest } from 'jslib/models/request/emailRequest';
import { EmailTokenRequest } from 'jslib/models/request/emailTokenRequest';

@Component({
    selector: 'app-change-email',
    templateUrl: 'change-email.component.html',
})
export class ChangeEmailComponent {
    masterPassword: string;
    newEmail: string;
    token: string;
    tokenSent = false;

    formPromise: Promise<any>;

    constructor(private apiService: ApiService, private i18nService: I18nService,
        private analytics: Angulartics2, private toasterService: ToasterService,
        private cryptoService: CryptoService, private messagingService: MessagingService) { }

    async submit() {
        const hasKey = await this.cryptoService.hasKey();
        if (!hasKey) {
            this.toasterService.popAsync('error', null, this.i18nService.t('updateKey'));
            return;
        }

        this.newEmail = this.newEmail.toLowerCase();
        if (!this.tokenSent) {
            const request = new EmailTokenRequest();
            request.newEmail = this.newEmail;
            request.masterPasswordHash = await this.cryptoService.hashPassword(this.masterPassword, null);
            try {
                this.formPromise = this.apiService.postEmailToken(request);
                await this.formPromise;
                this.tokenSent = true;
            } catch { }
        } else {
            const request = new EmailRequest();
            request.token = this.token;
            request.newEmail = this.newEmail;
            request.masterPasswordHash = await this.cryptoService.hashPassword(this.masterPassword, null);
            const newKey = await this.cryptoService.makeKey(this.masterPassword, this.newEmail);
            request.newMasterPasswordHash = await this.cryptoService.hashPassword(this.masterPassword, newKey);
            const encKey = await this.cryptoService.getEncKey();
            const newEncKey = await this.cryptoService.encrypt(encKey.key, newKey);
            request.key = newEncKey.encryptedString;
            try {
                this.formPromise = this.apiService.postEmail(request);
                await this.formPromise;
                this.reset();
                this.analytics.eventTrack.next({ action: 'Changed Email' });
                this.toasterService.popAsync('success', this.i18nService.t('emailChanged'),
                    this.i18nService.t('logBackIn'));
                this.messagingService.send('logout');
            } catch { }
        }
    }

    reset() {
        this.token = this.newEmail = this.masterPassword = null;
        this.tokenSent = false;
    }
}
