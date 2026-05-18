"use strict";

const POKEMON_LIST_API = "https://pokeapi.co/api/v2/pokemon?limit=1500";
const OFFICIAL_ARTWORK_BASE =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork";

const DIFFICULTIES = {
  easy: { label: "Easy", pairs: 4, seconds: 30 },
  medium: { label: "Medium", pairs: 6, seconds: 45 },
  hard: { label: "Hard", pairs: 8, seconds: 60 },
};

const FALLBACK_POKEMON = [
  { id: 1, name: "bulbasaur" },
  { id: 4, name: "charmander" },
  { id: 7, name: "squirtle" },
  { id: 25, name: "pikachu" },
  { id: 39, name: "jigglypuff" },
  { id: 52, name: "meowth" },
  { id: 54, name: "psyduck" },
  { id: 58, name: "growlithe" },
  { id: 133, name: "eevee" },
  { id: 143, name: "snorlax" },
  { id: 150, name: "mewtwo" },
  { id: 151, name: "mew" },
].map((pokemon) => ({
  ...pokemon,
  image: `${OFFICIAL_ARTWORK_BASE}/${pokemon.id}.png`,
}));

const FLIP_MS = 600;
const MISMATCH_VIEW_MS = 850;
const POWER_UP_MS = 3000;

let pokemonListCache = null;

const state = {
  cards: [],
  firstCard: null,
  secondCard: null,
  clicks: 0,
  matchedPairs: 0,
  totalPairs: DIFFICULTIES.easy.pairs,
  secondsRemaining: DIFFICULTIES.easy.seconds,
  gameActive: false,
  lockBoard: false,
  loading: false,
  powerUpUsed: false,
  previewing: false,
  timerId: null,
  clockId: null,
  timeoutIds: [],
  gameToken: 0,
};

const elements = {};

document.addEventListener("DOMContentLoaded", setup);

function setup() {
  cacheElements();
  bindEvents();
  applySavedTheme();
  updateClock();
  state.clockId = window.setInterval(updateClock, 1000);
  renderWaitingCards();
  updateStatus();
  updateControlStates();
}

function cacheElements() {
  elements.grid = document.querySelector("#game-grid");
  elements.template = document.querySelector("#card-template");
  elements.difficulty = document.querySelector("#difficulty-select");
  elements.theme = document.querySelector("#theme-select");
  elements.startButton = document.querySelector("#start-button");
  elements.resetButton = document.querySelector("#reset-button");
  elements.powerButton = document.querySelector("#power-button");
  elements.message = document.querySelector("#message-display");
  elements.clock = document.querySelector("#clock-display");
  elements.time = document.querySelector("#time-display");
  elements.clicks = document.querySelector("#clicks-display");
  elements.pairsLeft = document.querySelector("#pairs-left-display");
  elements.matched = document.querySelector("#matched-display");
  elements.total = document.querySelector("#total-display");
}

function bindEvents() {
  elements.startButton.addEventListener("click", startGame);
  elements.resetButton.addEventListener("click", startGame);
  elements.powerButton.addEventListener("click", usePowerUp);

  elements.difficulty.addEventListener("change", () => {
    const difficulty = getSelectedDifficulty();
    elements.grid.dataset.difficulty = elements.difficulty.value;

    if (!state.gameActive && !state.loading) {
      state.totalPairs = difficulty.pairs;
      state.secondsRemaining = difficulty.seconds;
      state.clicks = 0;
      state.matchedPairs = 0;
      renderWaitingCards();
      updateStatus();
    }

    setMessage(`${difficulty.label} will be used for the next game.`);
  });

  elements.theme.addEventListener("change", () => {
    setTheme(elements.theme.value);
  });
}

async function startGame() {
  if (state.loading) {
    return;
  }

  const difficulty = getSelectedDifficulty();
  const token = state.gameToken + 1;
  state.gameToken = token;
  state.loading = true;
  state.lockBoard = true;
  state.gameActive = false;
  resetRoundState(difficulty);
  clearTimer();
  clearPendingTimeouts();
  elements.grid.dataset.difficulty = elements.difficulty.value;
  renderLoadingCards(difficulty.pairs * 2);
  setMessage("Loading a random Pokemon card set from PokeAPI...");
  updateStatus();
  updateControlStates();

  try {
    const pokemon = await getRandomPokemon(difficulty.pairs);

    if (state.gameToken !== token) {
      return;
    }

    const deck = buildDeck(pokemon);
    renderCards(deck);
    state.gameActive = true;
    state.lockBoard = false;
    state.loading = false;
    startTimer();
    setMessage(`${difficulty.label} game started.`);
  } catch (error) {
    console.error(error);
    state.loading = false;
    state.lockBoard = false;
    renderWaitingCards();
    setMessage("Unable to load Pokemon cards. Please try Start again.");
  } finally {
    updateStatus();
    updateControlStates();
  }
}

function resetRoundState(difficulty) {
  state.cards = [];
  state.firstCard = null;
  state.secondCard = null;
  state.clicks = 0;
  state.matchedPairs = 0;
  state.totalPairs = difficulty.pairs;
  state.secondsRemaining = difficulty.seconds;
  state.powerUpUsed = false;
  state.previewing = false;
}

async function getRandomPokemon(count) {
  try {
    const list = await getPokemonList();
    const shuffledEntries = shuffle([...list]);
    const selectedPokemon = [];
    const usedKeys = new Set();

    for (const entry of shuffledEntries) {
      if (selectedPokemon.length === count) {
        break;
      }

      const key = entry.url || entry.name;
      if (usedKeys.has(key)) {
        continue;
      }

      usedKeys.add(key);

      try {
        const pokemon = await fetchPokemonDetail(entry);
        selectedPokemon.push(pokemon);
      } catch (error) {
        console.warn(`Skipping ${entry.name}:`, error);
      }
    }

    if (selectedPokemon.length >= count) {
      return selectedPokemon;
    }

    return fillWithFallbackPokemon(selectedPokemon, count);
  } catch (error) {
    console.warn("PokeAPI list request failed. Using fallback Pokemon.", error);
    return shuffle([...FALLBACK_POKEMON]).slice(0, count);
  }
}

async function getPokemonList() {
  if (pokemonListCache) {
    return pokemonListCache;
  }

  const response = await fetch(POKEMON_LIST_API);
  if (!response.ok) {
    throw new Error(`PokeAPI list request failed with ${response.status}`);
  }

  const data = await response.json();
  pokemonListCache = data.results;
  return pokemonListCache;
}

async function fetchPokemonDetail(entry) {
  const response = await fetch(entry.url);
  if (!response.ok) {
    throw new Error(`Pokemon detail request failed with ${response.status}`);
  }

  const data = await response.json();
  const image =
    data.sprites?.other?.["official-artwork"]?.front_default ||
    data.sprites?.front_default;

  if (!image) {
    throw new Error("No usable image found");
  }

  return {
    id: data.id,
    name: data.name,
    image,
  };
}

function fillWithFallbackPokemon(selectedPokemon, count) {
  const usedNames = new Set(selectedPokemon.map((pokemon) => pokemon.name));
  const replacements = shuffle([...FALLBACK_POKEMON]).filter(
    (pokemon) => !usedNames.has(pokemon.name),
  );

  return [...selectedPokemon, ...replacements].slice(0, count);
}

function buildDeck(pokemonList) {
  const pairedCards = pokemonList.flatMap((pokemon) => {
    const pairId = `${pokemon.id}-${pokemon.name}`;

    return [
      {
        ...pokemon,
        pairId,
        cardId: `${pairId}-a-${cryptoId()}`,
        matched: false,
      },
      {
        ...pokemon,
        pairId,
        cardId: `${pairId}-b-${cryptoId()}`,
        matched: false,
      },
    ];
  });

  return shuffle(pairedCards);
}

function renderWaitingCards() {
  const difficulty = getSelectedDifficulty();
  elements.grid.innerHTML = "";
  elements.grid.dataset.difficulty = elements.difficulty.value;

  for (let index = 0; index < difficulty.pairs * 2; index += 1) {
    const placeholder = document.createElement("div");
    placeholder.className = "card card-placeholder";
    placeholder.innerHTML = `
      <span class="card-inner">
        <span class="card-face card-back">
          <img src="assets/back.webp" alt="">
        </span>
      </span>
    `;
    elements.grid.appendChild(placeholder);
  }
}

function renderLoadingCards(cardCount) {
  elements.grid.innerHTML = "";

  for (let index = 0; index < cardCount; index += 1) {
    const placeholder = document.createElement("div");
    placeholder.className = "card card-placeholder is-loading";
    placeholder.innerHTML = `
      <span class="card-inner">
        <span class="card-face card-back">
          <img src="assets/back.webp" alt="">
        </span>
      </span>
    `;
    elements.grid.appendChild(placeholder);
  }
}

function renderCards(deck) {
  elements.grid.innerHTML = "";
  state.cards = deck.map((card) => {
    const fragment = elements.template.content.cloneNode(true);
    const cardElement = fragment.querySelector(".card");
    const image = fragment.querySelector(".pokemon-image");
    const name = fragment.querySelector(".pokemon-name");

    cardElement.dataset.cardId = card.cardId;
    cardElement.dataset.pairId = card.pairId;
    image.src = card.image;
    image.alt = card.name;
    name.textContent = formatPokemonName(card.name);
    cardElement.addEventListener("click", handleCardClick);
    elements.grid.appendChild(fragment);

    return {
      ...card,
      element: cardElement,
    };
  });
}

function handleCardClick(event) {
  const cardElement = event.currentTarget;
  const card = getCardByElement(cardElement);

  if (
    !card ||
    !state.gameActive ||
    state.lockBoard ||
    state.previewing ||
    card.matched ||
    cardElement.classList.contains("is-flipped")
  ) {
    return;
  }

  state.clicks += 1;
  flipCard(card);

  if (!state.firstCard) {
    state.firstCard = card;
    updateStatus();
    updateControlStates();
    return;
  }

  state.secondCard = card;
  state.lockBoard = true;
  updateStatus();
  updateControlStates();

  scheduleTimeout(resolveTurn, FLIP_MS);
}

function resolveTurn() {
  if (!state.gameActive || !state.firstCard || !state.secondCard) {
    return;
  }

  const isMatch = state.firstCard.pairId === state.secondCard.pairId;

  if (isMatch) {
    markMatchedCards();
    clearSelectedCards();
    state.lockBoard = false;
    setMessage("Match found.");

    if (state.matchedPairs === state.totalPairs) {
      finishGame(true);
      return;
    }

    updateStatus();
    updateControlStates();
    return;
  }

  setMessage("No match.");

  scheduleTimeout(() => {
    if (!state.gameActive) {
      return;
    }

    unflipCard(state.firstCard);
    unflipCard(state.secondCard);

    scheduleTimeout(() => {
      if (!state.gameActive) {
        return;
      }

      clearSelectedCards();
      state.lockBoard = false;
      updateStatus();
      updateControlStates();
    }, FLIP_MS);
  }, MISMATCH_VIEW_MS);
}

function flipCard(card) {
  card.element.classList.add("is-flipped");
}

function unflipCard(card) {
  if (card) {
    card.element.classList.remove("is-flipped");
  }
}

function markMatchedCards() {
  [state.firstCard, state.secondCard].forEach((card) => {
    card.matched = true;
    card.element.classList.add("is-matched");
    card.element.setAttribute("aria-disabled", "true");
  });

  state.matchedPairs += 1;
}

function clearSelectedCards() {
  state.firstCard = null;
  state.secondCard = null;
}

function usePowerUp() {
  if (
    !state.gameActive ||
    state.powerUpUsed ||
    state.lockBoard ||
    state.firstCard ||
    state.previewing
  ) {
    return;
  }

  state.powerUpUsed = true;
  state.previewing = true;
  state.lockBoard = true;
  setMessage("Power-up active: all unmatched cards are revealed.");
  updateControlStates();

  const previewCards = state.cards.filter(
    (card) => !card.matched && !card.element.classList.contains("is-flipped"),
  );

  previewCards.forEach((card) => {
    card.element.classList.add("is-preview");
  });

  scheduleTimeout(() => {
    previewCards.forEach((card) => {
      card.element.classList.remove("is-preview");
    });

    if (!state.gameActive) {
      return;
    }

    state.previewing = false;
    state.lockBoard = false;
    setMessage("Power-up used.");
    updateControlStates();
  }, POWER_UP_MS);
}

function startTimer() {
  clearTimer();
  state.timerId = window.setInterval(() => {
    state.secondsRemaining -= 1;
    updateStatus();

    if (state.secondsRemaining <= 0) {
      finishGame(false);
    }
  }, 1000);
}

function finishGame(playerWon) {
  state.gameActive = false;
  state.lockBoard = true;
  state.previewing = false;
  clearTimer();
  clearPendingTimeouts();

  state.cards.forEach((card) => {
    card.element.classList.remove("is-preview");
    card.element.setAttribute("aria-disabled", "true");
  });

  setMessage(
    playerWon
      ? `You won in ${state.clicks} clicks.`
      : "Game over. The timer ran out.",
  );
  updateStatus();
  updateControlStates();
}

function clearTimer() {
  if (state.timerId) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
}

function scheduleTimeout(callback, delay) {
  const timeoutId = window.setTimeout(() => {
    state.timeoutIds = state.timeoutIds.filter((id) => id !== timeoutId);
    callback();
  }, delay);

  state.timeoutIds.push(timeoutId);
  return timeoutId;
}

function clearPendingTimeouts() {
  state.timeoutIds.forEach((timeoutId) => {
    window.clearTimeout(timeoutId);
  });
  state.timeoutIds = [];
}

function updateStatus() {
  const pairsLeft = Math.max(state.totalPairs - state.matchedPairs, 0);

  elements.time.textContent = formatSeconds(state.secondsRemaining);
  elements.clicks.textContent = state.clicks;
  elements.pairsLeft.textContent = pairsLeft;
  elements.matched.textContent = state.matchedPairs;
  elements.total.textContent = state.totalPairs;
}

function updateClock() {
  elements.clock.textContent = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function updateControlStates() {
  elements.startButton.disabled = state.loading;
  elements.resetButton.disabled = state.loading;
  elements.difficulty.disabled = state.loading;
  elements.powerButton.disabled =
    !state.gameActive ||
    state.loading ||
    state.lockBoard ||
    state.previewing ||
    state.powerUpUsed ||
    Boolean(state.firstCard);

  elements.powerButton.textContent = state.powerUpUsed ? "Reveal Used" : "Reveal";
}

function setMessage(message) {
  elements.message.textContent = message;
}

function getSelectedDifficulty() {
  return DIFFICULTIES[elements.difficulty.value] || DIFFICULTIES.easy;
}

function getCardByElement(cardElement) {
  return state.cards.find((card) => card.element === cardElement);
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;

  try {
    window.localStorage.setItem("pokemon-memory-theme", theme);
  } catch (error) {
    console.warn("Theme preference could not be saved.", error);
  }
}

function applySavedTheme() {
  let savedTheme = null;

  try {
    savedTheme = window.localStorage.getItem("pokemon-memory-theme");
  } catch (error) {
    console.warn("Theme preference could not be loaded.", error);
  }

  if (savedTheme && ["light", "dark", "electric"].includes(savedTheme)) {
    elements.theme.value = savedTheme;
  }

  setTheme(elements.theme.value);
}

function formatPokemonName(name) {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatSeconds(totalSeconds) {
  const safeSeconds = Math.max(totalSeconds, 0);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function shuffle(items) {
  const array = [...items];

  for (let index = array.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [array[index], array[swapIndex]] = [array[swapIndex], array[index]];
  }

  return array;
}

function randomInt(max) {
  if (window.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return values[0] % max;
  }

  return Math.floor(Math.random() * max);
}

function cryptoId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
