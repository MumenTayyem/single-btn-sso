const KEYCLOAK_REALM_URL = 'http://keycloak.localtest.me:8180/realms/demo';
const CLIENT_ID = 'entry-router';
const ENTITY_GROUP_PATTERN = /^ENT-([A-Z0-9]{1,12})-/;
const LOGIN_PORTLET = 'com_liferay_login_web_portlet_LoginPortlet';
const PKCE_STORAGE_KEY = 'entry-router:pkce';

let authCodeTaken = false;

function takeAuthCodeFromUrl() {
	if (authCodeTaken) {
		return null;
	}

	const authCode = new URLSearchParams(location.search).get('code');

	if (!authCode) {
		return null;
	}

	authCodeTaken = true;
	history.replaceState({}, '', location.pathname);

	return authCode;
}

function getRedirectUri() {
	return location.origin + location.pathname;
}

function getInstanceLoginUrl(entity) {
	const params = new URLSearchParams({
		p_p_id: LOGIN_PORTLET,
		p_p_lifecycle: '1',
		[`_${LOGIN_PORTLET}_jakarta.portlet.action`]:
			'/login/openid_connect_request',
		[`_${LOGIN_PORTLET}_OPEN_ID_CONNECT_PROVIDER_NAME`]: `keycloak-${entity}`,
		[`_${LOGIN_PORTLET}_redirect`]: '/',
	});

	return `http://${entity}.localtest.me:8080/sign-in?${params}`;
}

function toBase64Url(bytes) {
	return btoa(String.fromCharCode(...new Uint8Array(bytes)))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

function randomString(byteCount) {
	return toBase64Url(crypto.getRandomValues(new Uint8Array(byteCount)));
}

async function createPkceChallenge(verifier) {
	if (!crypto.subtle) {
		return {method: 'plain', value: verifier};
	}

	const hash = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(verifier)
	);

	return {method: 'S256', value: toBase64Url(hash)};
}

async function redirectToKeycloak() {
	const verifier = randomString(32);
	const state = randomString(16);

	sessionStorage.setItem(PKCE_STORAGE_KEY, JSON.stringify({state, verifier}));

	const challenge = await createPkceChallenge(verifier);

	const params = new URLSearchParams({
		client_id: CLIENT_ID,
		redirect_uri: getRedirectUri(),
		response_type: 'code',
		scope: 'openid profile email',
		state,
		code_challenge: challenge.value,
		code_challenge_method: challenge.method,
	});

	location.replace(
		`${KEYCLOAK_REALM_URL}/protocol/openid-connect/auth?${params}`
	);
}

function decodeTokenPayload(token) {
	const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
	const bytes = Uint8Array.from(atob(payload), (char) => char.charCodeAt(0));

	return JSON.parse(new TextDecoder().decode(bytes));
}

async function fetchUserClaims(authCode) {
	const saved = JSON.parse(sessionStorage.getItem(PKCE_STORAGE_KEY) || '{}');

	sessionStorage.removeItem(PKCE_STORAGE_KEY);

	const response = await fetch(
		`${KEYCLOAK_REALM_URL}/protocol/openid-connect/token`,
		{
			method: 'POST',
			headers: {'Content-Type': 'application/x-www-form-urlencoded'},
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				client_id: CLIENT_ID,
				code: authCode,
				code_verifier: saved.verifier || '',
				redirect_uri: getRedirectUri(),
			}),
		}
	);

	if (!response.ok) {
		throw new Error(`Token exchange failed: ${response.status}`);
	}

	const {id_token: idToken} = await response.json();

	return decodeTokenPayload(idToken);
}

function getEntities(groups) {
	const entities = new Set();

	for (const group of groups || []) {
		const match = ENTITY_GROUP_PATTERN.exec(group);

		if (match) {
			entities.add(match[1].toLowerCase());
		}
	}

	return [...entities].sort();
}

function createMessage(text) {
	const paragraph = document.createElement('p');

	paragraph.textContent = text;

	return paragraph;
}

function createSignInButton() {
	const button = document.createElement('button');

	button.type = 'button';
	button.textContent = 'Sign in';
	button.addEventListener('click', () => redirectToKeycloak());

	return button;
}

function createEntityList(entities) {
	const list = document.createElement('ul');

	for (const entity of entities) {
		const link = document.createElement('a');

		link.href = getInstanceLoginUrl(entity);
		link.textContent = entity.toUpperCase();

		const item = document.createElement('li');

		item.appendChild(link);
		list.appendChild(item);
	}

	return list;
}

class EntryRouter extends HTMLElement {
	async connectedCallback() {
		const authCode = takeAuthCodeFromUrl();

		if (authCode) {
			await this.finishSignIn(authCode);
		}
		else if (!authCodeTaken) {
			this.show('WebsiteHub administration', createSignInButton());
		}
	}

	async finishSignIn(authCode) {
		this.show('Signing you in…', createMessage('One moment.'));

		try {
			const claims = await fetchUserClaims(authCode);

			this.routeUser(getEntities(claims.groups));
		}
		catch (error) {
			this.show('Sign-in failed', createMessage(String(error)));
		}
	}

	routeUser(entities) {
		if (entities.length === 0) {
			this.show(
				'No entity access',
				createMessage(
					'Your account is not a member of any entity. Contact the platform team.'
				)
			);
		}
		else if (entities.length === 1) {
			location.replace(getInstanceLoginUrl(entities[0]));
		}
		else {
			this.show('Choose an entity', createEntityList(entities));
		}
	}

	show(title, content) {
		const heading = document.createElement('h2');

		heading.textContent = title;

		this.replaceChildren(heading, content);
	}
}

if (!customElements.get('entry-router')) {
	customElements.define('entry-router', EntryRouter);
}
