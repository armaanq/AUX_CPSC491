import React, { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { getBlocked, unblockUser, type BlockedUser } from '../api/users';
import { Avatar } from '../components/Avatar';
import { Button, Page, palette, ui } from '../components/Kit';
import { PRIVACY_POLICY_URL, SUPPORT_EMAIL, TERMS_URL } from '../data/links';
import { useAuth } from '../state/AuthProvider';

export function ProfileSettingsScreen() {
  const { user, saveProfile, deleteAccount } = useAuth();
  // Your bio is edited on the profile page itself.
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // null while loading.
  const [blocked, setBlocked] = useState<BlockedUser[] | null>(null);
  const [blockedError, setBlockedError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getBlocked().then(
      ({ users }) => active && setBlocked(users),
      (err: Error) => active && setBlockedError(`Couldn’t load blocked accounts. ${err.message}`),
    );
    return () => {
      active = false;
    };
  }, []);

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
        <Text style={ui.heading}>Blocked accounts</Text>
        {blocked === null && !blockedError && <Text style={ui.body}>Loading…</Text>}
        {blockedError && <Text style={ui.body}>{blockedError}</Text>}
        {blocked?.length === 0 && <Text style={ui.body}>You haven’t blocked anyone.</Text>}
        {blocked?.map(u => (
          <View key={u.id} style={ui.between}>
            <Text style={[ui.musicTitle, { flex: 1 }]} numberOfLines={1}>@{u.username}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Unblock @${u.username}`}
              disabled={busy}
              onPress={() => run(async () => {
                await unblockUser(u.id);
                setBlocked(list => list?.filter(x => x.id !== u.id) ?? null);
                setMessage(`Unblocked @${u.username}.`);
              })}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={ui.link}>Unblock</Text>
            </Pressable>
          </View>
        ))}
      </View>
      <View style={ui.card}>
        <Text style={ui.heading}>About AUX</Text>
        <View style={[ui.row, { gap: 24 }]}>
          {[
            { label: 'Privacy Policy', url: PRIVACY_POLICY_URL },
            { label: 'Terms of Use', url: TERMS_URL },
          ].map(({ label, url }) => (
            <Pressable
              key={url}
              accessibilityRole="link"
              onPress={() => Linking.openURL(url).catch(() => setError(`Couldn’t open the ${label}. It’s at ${url}`))}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={ui.link}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={ui.fine} selectable>Questions or problems? Email {SUPPORT_EMAIL}</Text>
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
