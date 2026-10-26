import React from 'react';
import { Alert, Text, TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { launchImageLibrary } from 'react-native-image-picker';
import { ProfileSettingsScreen } from '../src/screens/ProfileSettingsScreen';
import { Button } from '../src/components/Kit';
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
let screen: TestRenderer.ReactTestRenderer;
async function press(title: string) {
  await act(async () => screen.root.findAllByType(Button).find(n => n.props.title === title)!.props.onPress());
}
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
