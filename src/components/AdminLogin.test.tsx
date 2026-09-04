// Tests de composant de l'écran de connexion admin.
//
// L'enjeu principal est négatif : ce formulaire ne doit RIEN comparer localement. Le mot
// de passe était autrefois une constante du bundle ; il part désormais au serveur, et
// l'écran se contente d'afficher ce que celui-ci répond.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { adminLogin } = vi.hoisted(() => ({ adminLogin: vi.fn() }));

vi.mock("@/services/adminAuth", () => ({ adminLogin }));

import { AdminLogin } from "./AdminLogin";

const champ = () => screen.getByLabelText("Mot de passe");
const bouton = () => screen.getByRole("button", { name: /Se connecter|Vérification/ });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AdminLogin", () => {
  it("envoie le mot de passe saisi au serveur puis signale la connexion", async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    adminLogin.mockResolvedValue(undefined);
    render(<AdminLogin onLogin={onLogin} />);

    await user.type(champ(), "phrase-de-passe-correcte");
    await user.click(bouton());

    await waitFor(() => expect(adminLogin).toHaveBeenCalledWith("phrase-de-passe-correcte"));
    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  it("affiche le message du serveur en cas de refus, sans connecter", async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    adminLogin.mockRejectedValue(new Error("Mot de passe incorrect"));
    render(<AdminLogin onLogin={onLogin} />);

    await user.type(champ(), "mauvais");
    await user.click(bouton());

    expect(await screen.findByText(/Mot de passe incorrect/)).toBeInTheDocument();
    expect(onLogin).not.toHaveBeenCalled();
  });

  it("relaie un message de configuration serveur tel quel", async () => {
    // Ce message a réellement servi à diagnostiquer une variable absente en preview :
    // le remplacer par un texte générique ferait perdre l'information.
    const user = userEvent.setup();
    adminLogin.mockRejectedValue(
      new Error("Opération admin impossible — vérifiez la configuration serveur (ARTIST_SECRET manquant)")
    );
    render(<AdminLogin onLogin={vi.fn()} />);

    await user.type(champ(), "peu-importe");
    await user.click(bouton());

    expect(await screen.findByText(/ARTIST_SECRET manquant/)).toBeInTheDocument();
  });

  it("vide le champ après un échec, pour ne pas resoumettre la même valeur", async () => {
    const user = userEvent.setup();
    adminLogin.mockRejectedValue(new Error("Mot de passe incorrect"));
    render(<AdminLogin onLogin={vi.fn()} />);

    await user.type(champ(), "mauvais");
    await user.click(bouton());

    await waitFor(() => expect(champ()).toHaveValue(""));
  });

  it("n'appelle pas le serveur tant que le champ est vide", async () => {
    render(<AdminLogin onLogin={vi.fn()} />);

    expect(bouton()).toBeDisabled();
    expect(adminLogin).not.toHaveBeenCalled();
  });

  it("accepte une phrase de passe longue (plus un code à quatre chiffres)", async () => {
    const user = userEvent.setup();
    adminLogin.mockResolvedValue(undefined);
    render(<AdminLogin onLogin={vi.fn()} />);

    const phrase = "une phrase de passe bien plus longue que quatre chiffres";
    await user.type(champ(), phrase);
    await user.click(bouton());

    await waitFor(() => expect(adminLogin).toHaveBeenCalledWith(phrase));
  });
});
