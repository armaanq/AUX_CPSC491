import React, { useRef, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { Avatar } from '../components/Avatar';
import { Button, Page, palette, ui } from '../components/Kit';
import { useAuth } from '../state/AuthProvider';

export function ProfileSettingsScreen() {
  const { user, saveProfile, deleteAccount } = useAuth();
  const [bio, setBio] = useState(user?.bio ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    try { await action(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  }

  async function choosePhoto() {
    await run(async () => {
      const result = await launchImageLibrary({
        mediaType: 'photo', selectionLimit: 1, maxWidth: 384, maxHeight: 384,
        quality: 0.7, includeBase64: true, assetRepresentationMode: 'compatible',
      });
      if (result.didCancel) return;
      if (result.errorCode) throw new Error(result.errorMessage || 'Unable to open your photo library. Check photo access in your device settings.');
      const photo = result.assets?.[0];
      // iOS converts HEIC/HEIF in compatible mode and reports JPEG as image/jpg.
      // Normalize the picker alias to the MIME type accepted by the API.
      const mimeType = photo?.type === 'image/jpg' ? 'image/jpeg' : photo?.type;
      if (!photo?.base64 || !['image/jpeg', 'image/png'].includes(mimeType ?? ''))
        throw new Error('This photo could not be converted. Please choose another photo.');
      if (photo.base64.length > 349528) throw new Error('This photo is too large. Choose a smaller photo (up to 256 KB).');
      await saveProfile({ avatarUrl: `data:${mimeType};base64,${photo.base64}` });
      setMessage('Profile photo updated.');
    });
  }

  return (
    <Page insetTop={false}>
      <View style={{ alignItems: 'center', gap: 10 }}>
        <Avatar seed="me" name={user?.username ?? ''} avatarUrl={user?.avatarUrl} size={96} />
        <Text style={ui.heading}>@{user?.username}</Text>
        <Text style={ui.fine}>{user?.email}</Text>
      </View>
      {error && <Text accessibilityRole="alert" style={[ui.body, { color: palette.accent }]}>{error}</Text>}
      {message && <Text accessibilityLiveRegion="polite" style={ui.body}>{message}</Text>}
      <View style={ui.card}>
        <Text style={ui.heading}>Profile photo</Text>
        <Text style={ui.body}>Choose a photo from your library. Other listeners will see it on your profile.</Text>
        <Button title={busy ? 'Please wait…' : 'Choose photo'} disabled={busy} onPress={choosePhoto} />
        {!!user?.avatarUrl && <Button secondary title="Remove photo" disabled={busy} onPress={() => run(async () => {
          await saveProfile({ avatarUrl: null }); setMessage('Profile photo removed.');
        })} />}
      </View>
      <View style={ui.card}>
        <Text style={ui.heading}>About you</Text>
        <TextInput accessibilityLabel="Profile bio" style={ui.input} multiline maxLength={160} value={bio} onChangeText={setBio} editable={!busy} />
        <Text style={ui.fine}>{bio.length}/160</Text>
        <Button title="Save bio" disabled={busy} onPress={() => run(async () => {
          await saveProfile({ bio: bio.trim() }); setMessage('Bio saved.');
        })} />
      </View>
      <View style={[ui.card, { borderColor: palette.accent }]}>
        <Text style={[ui.heading, { color: palette.accent }]}>Delete account</Text>
        <Text style={ui.body}>Permanently delete your account, profile photo, rankings, saved music, favorites, and friendships. This cannot be undone.</Text>
        <TextInput accessibilityLabel="Current password" placeholder="Current password" secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="password" style={ui.input} value={password} onChangeText={setPassword} editable={!busy} />
        <Button secondary title="Delete my account" disabled={busy || !password} onPress={() => Alert.alert(
          'Permanently delete your account?', 'All your account data will be removed. This cannot be undone.', [
            { text: 'Keep account', style: 'cancel' },
            { text: 'Delete account', style: 'destructive', onPress: () => run(async () => { await deleteAccount(password); }) },
          ],
        )} />
      </View>
    </Page>
  );
}
