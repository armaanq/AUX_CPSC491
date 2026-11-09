import React from 'react';
import { Alert, Linking, Text, TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { launchImageLibrary } from 'react-native-image-picker';
import { ProfileSettingsScreen } from '../src/screens/ProfileSettingsScreen';
import { Button } from '../src/components/Kit';
import { PRIVACY_POLICY_URL, TERMS_URL } from '../src/data/links';
jest.mock('../src/components/Kit', () => ({
  ...jest.requireActual('../src/components/Kit'),
  Page: ({ children }: { children: React.ReactNode }) => children,
}));
const mockSave = jest.fn();
const mockDelete = jest.fn();
jest.mock('../src/state/AuthProvider', () => ({ useAuth: () => ({
  user: { username: 'listener', bio: 'Music', avatarUrl: 'data:image/png;base64,old' },
  saveProfile: mockSave, deleteAccount: mockDelete,
}) }));
const mockGetBlocked = jest.fn(() => Promise.resolve({ users: [] as { id: string; username: string }[] }));
const mockUnblock = jest.fn((_id: string) => Promise.resolve({ blocked: false }));
jest.mock('../src/api/users', () => ({
  getBlocked: () => mockGetBlocked(),
  unblockUser: (id: string) => mockUnblock(id),
}));
let screen: TestRenderer.ReactTestRenderer;
async function press(title: string) {
  await act(async () => screen.root.findAllByType(Button).find(n => n.props.title === title)!.props.onPress());
}
/** Taps a Pressable by its accessibility label or its text. */
async function tap(label: string) {
  const target = screen.root.findAll(n =>
    typeof n.props.onPress === 'function' &&
    (n.props.accessibilityLabel === label ||
      n.findAllByType(Text).some(t => t.props.children === label)),
  )[0];
  await act(async () => target.props.onPress());
}
const shown = () => screen.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));
beforeEach(async () => {
  jest.clearAllMocks();
  await act(async () => { screen = TestRenderer.create(<ProfileSettingsScreen />); });
});
afterEach(async () => { await act(async () => screen.unmount()); });
it('uploads a selected photo and leaves cancellation alone', async () => {
  (launchImageLibrary as jest.Mock).mockResolvedValueOnce({ didCancel: true });
  await press('Choose photo');
  expect(mockSave).not.toHaveBeenCalled();
  (launchImageLibrary as jest.Mock).mockResolvedValueOnce({ assets: [{ type: 'image/jpeg', base64: '/9j/AA==' }] });
  await press('Choose photo');
  expect(mockSave).toHaveBeenCalledWith({ avatarUrl: 'data:image/jpeg;base64,/9j/AA==' });
});
it('removes a photo', async () => {
  await press('Remove photo');
  expect(mockSave).toHaveBeenCalledWith({ avatarUrl: null });
});
it('shows upload errors', async () => {
  (launchImageLibrary as jest.Mock).mockResolvedValueOnce({ errorCode: 'permission', errorMessage: 'Photo access denied' });
  await press('Choose photo');
  expect(screen.root.findAllByType(Text).some(n => n.props.children === 'Photo access denied')).toBe(true);
  expect(mockSave).not.toHaveBeenCalled();
});
it('requires a password and confirmation before deleting', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  expect(screen.root.findAllByType(Button).find(n => n.props.title === 'Delete my account')!.props.disabled).toBe(true);
  await act(async () => screen.root.findAllByType(TextInput).find(n => n.props.accessibilityLabel === 'Current password')!.props.onChangeText('my-password'));
  await press('Delete my account');
  expect(mockDelete).not.toHaveBeenCalled();
  await act(async () => { await alert.mock.calls[0][2]!.find(b => b.text === 'Delete account')!.onPress!(); });
  expect(mockDelete).toHaveBeenCalledWith('my-password');
  alert.mockRestore();
});

it('accepts an iOS HEIC selection converted by the native picker to image/jpg', async () => {
  (launchImageLibrary as jest.Mock).mockResolvedValueOnce({
    assets: [{ type: 'image/jpg', fileName: 'converted.jpg', base64: '/9j/AA==' }],
  });
  await press('Choose photo');
  expect(launchImageLibrary).toHaveBeenCalledWith(expect.objectContaining({
    assetRepresentationMode: 'compatible', quality: 0.7, includeBase64: true,
  }));
  expect(mockSave).toHaveBeenCalledWith({ avatarUrl: 'data:image/jpeg;base64,/9j/AA==' });
});
it('does not relabel unconverted HEIC bytes as JPEG', async () => {
  (launchImageLibrary as jest.Mock).mockResolvedValueOnce({
    assets: [{ type: 'image/heic', base64: 'AAAAAGZ0eXBoZWlj' }],
  });
  await press('Choose photo');
  expect(mockSave).not.toHaveBeenCalled();
  expect(screen.root.findAllByType(Text).some(n =>
    n.props.children === 'This photo could not be converted. Please choose another photo.',
  )).toBe(true);
});

it('lists blocked accounts and unblocks one', async () => {
  await act(async () => screen.unmount());
  mockGetBlocked.mockResolvedValueOnce({ users: [{ id: 'u2', username: 'arian' }, { id: 'u3', username: 'zoe' }] });
  await act(async () => { screen = TestRenderer.create(<ProfileSettingsScreen />); });
  expect(shown()).toContain('@arian');
  await tap('Unblock @arian');
  expect(mockUnblock).toHaveBeenCalledWith('u2');
  expect(shown()).not.toContain('@arian');
  expect(shown()).toContain('@zoe');
  expect(shown()).toContain('Unblocked @arian.');
});

it('says when nobody is blocked', () => {
  expect(shown()).toContain('You haven’t blocked anyone.');
});

it('links to the privacy policy and terms', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  await tap('Privacy Policy');
  await tap('Terms of Use');
  expect(open.mock.calls.map(c => c[0])).toEqual([PRIVACY_POLICY_URL, TERMS_URL]);
  open.mockRestore();
});
