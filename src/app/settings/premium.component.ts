import {
    Component,
    OnInit,
    ViewChild,
} from '@angular/core';
import { Router } from '@angular/router';

import { ToasterService } from 'angular2-toaster';
import { Angulartics2 } from 'angulartics2';

import { ApiService } from 'jslib/abstractions/api.service';
import { I18nService } from 'jslib/abstractions/i18n.service';
import { MessagingService } from 'jslib/abstractions/messaging.service';
import { PlatformUtilsService } from 'jslib/abstractions/platformUtils.service';
import { SyncService } from 'jslib/abstractions/sync.service';
import { TokenService } from 'jslib/abstractions/token.service';

import { PaymentComponent } from './payment.component';

@Component({
    selector: 'app-premium',
    templateUrl: 'premium.component.html',
})
export class PremiumComponent implements OnInit {
    @ViewChild(PaymentComponent) paymentComponent: PaymentComponent;

    selfHosted = false;
    premiumPrice = 10;
    storageGbPrice = 4;
    additionalStorage = 0;

    formPromise: Promise<any>;

    constructor(private apiService: ApiService, private i18nService: I18nService,
        private analytics: Angulartics2, private toasterService: ToasterService,
        platformUtilsService: PlatformUtilsService, private tokenService: TokenService,
        private router: Router, private messagingService: MessagingService,
        private syncService: SyncService) {
        this.selfHosted = platformUtilsService.isSelfHost();
    }

    async ngOnInit() {
        const premium = await this.tokenService.getPremium();
        if (premium) {
            this.router.navigate(['/settings/billing']);
            return;
        }
    }

    async submit() {
        let files: FileList = null;
        if (this.selfHosted) {
            const fileEl = document.getElementById('file') as HTMLInputElement;
            files = fileEl.files;
            if (files == null || files.length === 0) {
                this.toasterService.popAsync('error', this.i18nService.t('errorOccurred'),
                    this.i18nService.t('selectFile'));
                return;
            }
        }

        try {
            if (this.selfHosted) {
                const fd = new FormData();
                fd.append('license', files[0]);
                this.formPromise = this.apiService.postAccountLicense(fd).then(() => {
                    return this.finalizePremium();
                });
            } else {
                this.formPromise = this.paymentComponent.createPaymentToken().then((token) => {
                    const fd = new FormData();
                    fd.append('paymentToken', token);
                    fd.append('additionalStorageGb', (this.additionalStorage || 0).toString());
                    return this.apiService.postPremium(fd);
                }).then(() => {
                    return this.finalizePremium();
                });
            }
            await this.formPromise;
        } catch { }
    }

    async finalizePremium() {
        await Promise.all([
            this.apiService.refreshIdentityToken(),
            this.syncService.fullSync(true),
        ]);
        this.analytics.eventTrack.next({ action: 'Signed Up Premium' });
        this.toasterService.popAsync('success', null, this.i18nService.t('premiumUpdated'));
        this.messagingService.send('purchasedPremium');
        this.router.navigate(['/settings/billing']);
    }

    get additionalStorageTotal(): number {
        return this.storageGbPrice * this.additionalStorage;
    }

    get total(): number {
        return this.additionalStorageTotal + this.premiumPrice;
    }
}
