import { MARKETPLACE } from '../src/common/constants';
import { AppStoreProvider } from '../src/modules/marketplace/providers/app-store.provider';
import { GooglePlayProvider } from '../src/modules/marketplace/providers/google-play.provider';

describe('mock marketplace providers', () => {
  it('returns applications for known bundles', async () => {
    const google = new GooglePlayProvider();
    const appStore = new AppStoreProvider();

    await expect(google.findApplication('com.demo.app1')).resolves.toEqual(
      expect.objectContaining({
        bundleId: 'com.demo.app1',
        marketplace: MARKETPLACE.googlePlay,
      }),
    );

    await expect(appStore.findApplication('com.demo.ios1')).resolves.toEqual(
      expect.objectContaining({
        bundleId: 'com.demo.ios1',
        marketplace: MARKETPLACE.appStore,
      }),
    );
  });

  it('returns null for unknown bundles', async () => {
    const google = new GooglePlayProvider();
    await expect(google.findApplication('unknown.bundle')).resolves.toBeNull();
  });
});
