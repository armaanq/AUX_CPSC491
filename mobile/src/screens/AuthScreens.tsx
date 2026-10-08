import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputInstance,
  type TextInputProps,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/AuthProvider';
import { Button, Page, palette, ui } from '../components/Kit';

const PASSWORD_MIN = 8;
const WAKE_UP_HINT_DELAY_MS = 5000;

function Field({
  label,
  hint,
  inputRef,
  ...input
}: TextInputProps & {
  label: string;
  hint?: string;
  inputRef?: React.Ref<TextInputInstance>;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        ref={inputRef}
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor={palette.muted}
        style={ui.input}
        {...input}
      />
      {hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

function ErrorText({ message }: { message: string | null }) {
  return message ? (
    <Text accessibilityRole="alert" style={styles.error}>
      {message}
    </Text>
  ) : null;
}

/** The shared server sleeps when nobody's using it; say so if waking it takes a while. */
function WakeUpHint() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), WAKE_UP_HINT_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  return slow ? (
    <Text style={styles.wakeUp}>
      Waking up the AUX server. After a quiet spell this can take up to a
      minute.
    </Text>
  ) : null;
}

/** Runs a login/signup call, showing its error and ignoring taps while it's in flight. */
function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(task: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // On success the navigator swaps to the app and this screen unmounts.
      await task();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}

export function LoginScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Login'>) {
  const { logIn } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const passwordRef = useRef<TextInputInstance>(null);
  const { busy, error, setError, run } = useSubmit();

  function submit() {
    if (!identifier.trim() || !password) {
      setError('Enter your email or username and your password.');
      return;
    }
    run(() => logIn(identifier, password));
  }

  return (
    <Page>
      <Text style={styles.brand}>AUX</Text>
      <View style={styles.intro}>
        <Text style={ui.label}>WELCOME BACK</Text>
        <Text style={ui.title}>{'Log in to your\ncollection.'}</Text>
      </View>
      <Field
        label="Email or username"
        value={identifier}
        onChangeText={setIdentifier}
        textContentType="username"
        autoComplete="username"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <Field
        label="Password"
        inputRef={passwordRef}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
        autoComplete="current-password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <ErrorText message={error} />
      <Button title={busy ? 'Logging in…' : 'Log in'} onPress={submit} />
      {busy && <WakeUpHint />}
      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate('Signup')}
        style={styles.switch}
      >
        <Text style={ui.body}>
          New to AUX? <Text style={ui.link}>Create an account</Text>
        </Text>
      </Pressable>
    </Page>
  );
}

export function SignupScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Signup'>) {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const usernameRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);
  const { busy, error, setError, run } = useSubmit();

  function submit() {
    if (!email.trim() || !username.trim() || !password) {
      setError('Fill in your email, a username and a password.');
      return;
    }
    if (password.length < PASSWORD_MIN) {
      setError(`Your password needs at least ${PASSWORD_MIN} characters.`);
      return;
    }
    run(() => signUp(email, username, password));
  }

  return (
    <Page>
      <Text style={styles.brand}>AUX</Text>
      <View style={styles.intro}>
        <Text style={ui.label}>JOIN AUX</Text>
        <Text style={ui.title}>{'Make your taste\ncount.'}</Text>
        <Text style={ui.body}>
          Rank songs head-to-head, build your list, and find people who hear it
          like you do.
        </Text>
      </View>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        returnKeyType="next"
        onSubmitEditing={() => usernameRef.current?.focus()}
      />
      <Field
        label="Username"
        hint="3–20 characters: letters, numbers, _ and ."
        inputRef={usernameRef}
        value={username}
        onChangeText={setUsername}
        textContentType="username"
        autoComplete="username-new"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <Field
        label="Password"
        hint={`At least ${PASSWORD_MIN} characters.`}
        inputRef={passwordRef}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="newPassword"
        autoComplete="new-password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <ErrorText message={error} />
      <Button
        title={busy ? 'Creating your account…' : 'Create account'}
        onPress={submit}
      />
      {busy && <WakeUpHint />}
      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate('Login')}
        style={styles.switch}
      >
        <Text style={ui.body}>
          Already have an account? <Text style={ui.link}>Log in</Text>
        </Text>
      </Pressable>
    </Page>
  );
}

/** Shown while checking a saved login with the server. */
export function SessionLoading() {
  return (
    <View style={styles.center}>
      <Text style={styles.brand}>AUX</Text>
      <ActivityIndicator color={palette.ink} />
      <WakeUpHint />
    </View>
  );
}

/** A saved login exists, but the server couldn't be reached to confirm it. */
export function SessionOffline() {
  const { error, retry, logOut } = useAuth();
  return (
    <Page>
      <Text style={styles.brand}>AUX</Text>
      <View style={styles.intro}>
        <Text style={ui.label}>CAN'T CONNECT</Text>
        <Text style={ui.title}>{'The server isn’t\nanswering.'}</Text>
        <Text style={ui.body}>{error}</Text>
      </View>
      <Button title="Try again" onPress={retry} />
      <Button secondary title="Log out" onPress={logOut} />
    </Page>
  );
}

const styles = StyleSheet.create({
  brand: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 4,
    color: palette.ink,
  },
  intro: { gap: 10 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: palette.ink },
  hint: { fontSize: 12, color: palette.muted },
  wakeUp: {
    fontSize: 13,
    lineHeight: 18,
    color: palette.muted,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  error: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: palette.accent },
  switch: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  center: {
    flex: 1,
    gap: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.paper,
  },
});
