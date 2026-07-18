export interface Player {
  id: string;
  name: string;
  age: number;
  position: 'GK' | 'DF' | 'MF' | 'FW';
  rating: number;
  energy: number;
  value: number;
  salary: number;
  goals: number;
  yellowCards: number;
  redCards: number;
  isInjured: boolean;
  injuryWeeks?: number;
  isStar: boolean;
  contractLocked: boolean;
  contractWeeks?: number;
  benchRounds?: number;
}

export interface Club {
  id: string;
  name: string;
  division: 'A' | 'B' | 'C';
  primaryColor: string;
  secondaryColor: string;
  textColor: string; // Light or dark text compatibility
  stadiumCapacity: number;
  stadiumName: string;
  ticketPrice: number;
  finances: number;
  confidence: number;
  reputation: number; // 1-100
  isPlayerClub: boolean;
  squad: Player[];
}

export interface ClubDefinition {
  id: string;
  name: string;
  division: 'A' | 'B' | 'C';
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  stadiumCapacity: number;
  stadiumName: string;
  reputation: number;
  stars: { name: string; position: 'GK' | 'DF' | 'MF' | 'FW'; rating: number }[];
}

const FIRST_NAMES = [
  'Lucas', 'Gabriel', 'Bruno', 'Rodrigo', 'Felipe', 'Marcos', 'Gustavo', 'Daniel', 'Rafael', 'Thiago',
  'Matheus', 'Arthur', 'Diego', 'Vinicius', 'Alex', 'Guilherme', 'Douglas', 'Everton', 'Henrique', 'Eduardo',
  'Marcelo', 'Ronaldo', 'Alan', 'Cauan', 'Dudu', 'Fabio', 'Gerson', 'Igor', 'Joao', 'Leo',
  'Mauricio', 'Nene', 'Otavio', 'Paulo', 'Ricardo', 'Samuel', 'Victor', 'Wellington', 'Yago', 'Zander'
];

const LAST_NAMES = [
  'Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes',
  'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Almeida', 'Lopes', 'Soares', 'Fernandes', 'Vieira', 'Barbosa',
  'Rocha', 'Dias', 'Nascimento', 'Moreira', 'Nunes', 'Mendes', 'Cardoso', 'Teixeira', 'Araujo', 'Melo',
  'Pinto', 'Cabral', 'Castro', 'Cardoso', 'Cavalcanti', 'Fontes', 'Borges', 'Neves', 'Motta', 'Miranda'
];

export const STAR_PLAYERS: Record<string, { name: string; position: 'GK' | 'DF' | 'MF' | 'FW'; rating: number }[]> = {
  athletico_pr: [
    { name: "Mycael", position: "GK", rating: 78 },
    { name: "Santos", position: "GK", rating: 75 },
    { name: "Matheus Soares", position: "GK", rating: 74 },
    { name: "Arthur Dias", position: "DF", rating: 80 },
    { name: "Carlos Terán", position: "DF", rating: 78 },
    { name: "Juan Felipe Aguirre", position: "DF", rating: 77 },
    { name: "Léo", position: "DF", rating: 77 },
    { name: "Dantas", position: "DF", rating: 75 },
    { name: "Lucas Esquivel", position: "DF", rating: 81 },
    { name: "Léo Derik", position: "DF", rating: 78 },
    { name: "Gastón Benavídez", position: "DF", rating: 80 },
    { name: "Gilberto", position: "DF", rating: 78 },
    { name: "Gilberto Junior", position: "DF", rating: 78 },
    { name: "Dudu", position: "DF", rating: 75 },
    { name: "Hayen Palacios", position: "DF", rating: 75 },
    { name: "Luiz Gustavo", position: "MF", rating: 74 },
    { name: "Juan Portilla", position: "MF", rating: 81 },
    { name: "João Cruz", position: "MF", rating: 78 },
    { name: "Felipinho", position: "MF", rating: 77 },
    { name: "Jádson", position: "MF", rating: 77 },
    { name: "Alejandro García", position: "MF", rating: 75 },
    { name: "Dudu", position: "MF", rating: 81 },
    { name: "Bruno Zapelli", position: "MF", rating: 80 },
    { name: "Chiqueti", position: "MF", rating: 80 },
    { name: "Isaac", position: "FW", rating: 77 },
    { name: "Stiven Mendoza", position: "FW", rating: 75 },
    { name: "Daniel Aguilar", position: "FW", rating: 74 },
    { name: "Bruninho", position: "FW", rating: 81 },
    { name: "Leozinho", position: "FW", rating: 75 },
    { name: "Kevin Viveros", position: "FW", rating: 83 },
    { name: "Jorge Rivaldo", position: "FW", rating: 78 },
    { name: "Renan Peixoto", position: "FW", rating: 77 },
    { name: "Renan Viana", position: "FW", rating: 74 }
  ],
  atletico_mg: [
    { name: "Everson", position: "GK", rating: 75 },
    { name: "Pedro Cobra", position: "GK", rating: 75 },
    { name: "Gabriel Delfim", position: "GK", rating: 75 },
    { name: "Robert", position: "GK", rating: 75 },
    { name: "Lyanco", position: "DF", rating: 79 },
    { name: "Ruan", position: "DF", rating: 79 },
    { name: "Léo Duarte", position: "DF", rating: 78 },
    { name: "Iván Román", position: "DF", rating: 78 },
    { name: "Vitor Hugo", position: "DF", rating: 75 },
    { name: "Rômulo", position: "DF", rating: 75 },
    { name: "Vitão", position: "DF", rating: 75 },
    { name: "Renan Lodi", position: "DF", rating: 82 },
    { name: "Kauã Pascini", position: "DF", rating: 75 },
    { name: "Natanael", position: "DF", rating: 79 },
    { name: "Angelo Preciado", position: "DF", rating: 79 },
    { name: "Alexsander", position: "MF", rating: 80 },
    { name: "Tomás Pérez", position: "MF", rating: 79 },
    { name: "Patrick", position: "MF", rating: 78 },
    { name: "Victor Hugo", position: "MF", rating: 81 },
    { name: "Alan Franco", position: "MF", rating: 79 },
    { name: "Maycon", position: "MF", rating: 78 },
    { name: "Mamady Cissé", position: "MF", rating: 77 },
    { name: "Índio", position: "MF", rating: 75 },
    { name: "Gustavo Scarpa", position: "MF", rating: 79 },
    { name: "Igor Gomes", position: "MF", rating: 78 },
    { name: "Reinier", position: "MF", rating: 78 },
    { name: "Tomás Cuello", position: "FW", rating: 80 },
    { name: "Dudu", position: "FW", rating: 75 },
    { name: "Bernard", position: "FW", rating: 75 },
    { name: "Alan Minda", position: "FW", rating: 79 },
    { name: "Cauã Soares", position: "FW", rating: 75 },
    { name: "Mateo Cassierra", position: "FW", rating: 81 }
  ],
  bahia: [
    { name: "Ronaldo", position: "GK", rating: 78 },
    { name: "Guido Herrera", position: "GK", rating: 78 },
    { name: "Léo Vieira", position: "GK", rating: 75 },
    { name: "Victor", position: "GK", rating: 75 },
    { name: "Santiago Ramos Mingo", position: "DF", rating: 82 },
    { name: "Kanu", position: "DF", rating: 79 },
    { name: "David Duarte", position: "DF", rating: 78 },
    { name: "Marco Moreno", position: "DF", rating: 75 },
    { name: "Luiz Gustavo", position: "DF", rating: 75 },
    { name: "Marcos Victor", position: "DF", rating: 75 },
    { name: "Fredi Gomes", position: "DF", rating: 75 },
    { name: "Luciano Juba", position: "DF", rating: 82 },
    { name: "Iago", position: "DF", rating: 79 },
    { name: "Zé Guilherme", position: "DF", rating: 75 },
    { name: "Román Gómez", position: "DF", rating: 78 },
    { name: "Caio Alexandre", position: "MF", rating: 81 },
    { name: "Nicolás Acevedo", position: "MF", rating: 80 },
    { name: "Erick", position: "MF", rating: 79 },
    { name: "Jean Lucas", position: "MF", rating: 82 },
    { name: "Rodrigo Nestor", position: "MF", rating: 81 },
    { name: "Everton Ribeiro", position: "MF", rating: 77 },
    { name: "Roger Gabriel", position: "MF", rating: 75 },
    { name: "Erick Pulga", position: "FW", rating: 82 },
    { name: "Ruan Pablo", position: "FW", rating: 81 },
    { name: "Mateo Sanabria", position: "FW", rating: 78 },
    { name: "Cristian Olivera", position: "FW", rating: 80 },
    { name: "Michel Araújo", position: "FW", rating: 78 },
    { name: "Ademir", position: "FW", rating: 77 },
    { name: "Alejo Veliz", position: "FW", rating: 79 },
    { name: "Dell", position: "FW", rating: 79 },
    { name: "Willian José", position: "FW", rating: 77 },
    { name: "Everaldo", position: "FW", rating: 75 }
  ],
  botafogo: [
    { name: "Danilo", position: "MF", rating: 86 },
    { name: "Álvaro Montoro", position: "MF", rating: 83 },
    { name: "Arthur Cabral", position: "FW", rating: 80 },
    { name: "Vitinho", position: "DF", rating: 80 },
    { name: "Cristian Medina", position: "MF", rating: 80 },
    { name: "Matheus Martins", position: "FW", rating: 80 },
    { name: "Santiago Rodriguez", position: "MF", rating: 80 },
    { name: "Alexander Barboza", position: "DF", rating: 79 },
    { name: "Nahuel Ferraresi", position: "DF", rating: 79 },
    { name: "Nathan Fernandes", position: "FW", rating: 79 },
    { name: "Alex Telles", position: "DF", rating: 78 },
    { name: "Léo Linck", position: "GK", rating: 78 },
    { name: "Patrick de Paula", position: "MF", rating: 78 },
    { name: "Kaio", position: "DF", rating: 77 },
    { name: "Bastos", position: "DF", rating: 75 },
    { name: "Raul", position: "GK", rating: 74 },
    { name: "Cristhian Loor", position: "GK", rating: 74 },
    { name: "Ythallo", position: "DF", rating: 74 },
    { name: "Anthony", position: "DF", rating: 74 },
    { name: "Marçal", position: "DF", rating: 74 },
    { name: "Jhoan Hernández", position: "DF", rating: 74 }
  ],
  bragantino: [
    { name: "Cleiton", position: "GK", rating: 80 },
    { name: "Tiago Volpi", position: "GK", rating: 75 },
    { name: "Fabrício", position: "GK", rating: 74 },
    { name: "Fernando Costa", position: "GK", rating: 74 },
    { name: "Gustavo Reis", position: "GK", rating: 74 },
    { name: "Gustavo Marques", position: "DF", rating: 80 },
    { name: "Guzmán Rodríguez", position: "DF", rating: 79 },
    { name: "Pedro Henrique", position: "DF", rating: 79 },
    { name: "Alix", position: "DF", rating: 79 },
    { name: "Eduardo", position: "DF", rating: 75 },
    { name: "Juninho Capixaba", position: "DF", rating: 81 },
    { name: "Vanderlan", position: "DF", rating: 79 },
    { name: "Cauê Nascimento", position: "DF", rating: 74 },
    { name: "Agustín Sant'Anna", position: "DF", rating: 79 },
    { name: "José Andrés Hurtado", position: "DF", rating: 79 },
    { name: "Ryan Augusto", position: "DF", rating: 77 },
    { name: "Fabinho", position: "MF", rating: 80 },
    { name: "Matheus Fernandes", position: "MF", rating: 77 },
    { name: "Gabriel", position: "MF", rating: 75 },
    { name: "Ignacio Sosa", position: "MF", rating: 80 },
    { name: "Eric Ramires", position: "MF", rating: 79 },
    { name: "Gustavo Neves", position: "MF", rating: 79 },
    { name: "Praxedes", position: "MF", rating: 77 },
    { name: "João Neto", position: "MF", rating: 74 },
    { name: "Rodriguinho", position: "MF", rating: 80 },
    { name: "Bruninho", position: "MF", rating: 77 },
    { name: "Marcelinho Braz", position: "MF", rating: 74 },
    { name: "Vinicinho", position: "FW", rating: 79 },
    { name: "Henry Mosquera", position: "FW", rating: 79 },
    { name: "Davi Gomes", position: "FW", rating: 74 },
    { name: "Lucas Barbosa", position: "FW", rating: 80 },
    { name: "José Herrera", position: "FW", rating: 78 },
    { name: "Ignacio Laquintana", position: "FW", rating: 77 },
    { name: "Isidro Pitta", position: "FW", rating: 81 },
    { name: "Thiago Borbas", position: "FW", rating: 79 },
    { name: "Fernando", position: "FW", rating: 77 },
    { name: "Eduardo Sasha", position: "FW", rating: 75 },
    { name: "Gabriel Novaes", position: "FW", rating: 74 }
  ],
  corinthians: [
    { name: "Hugo Souza", position: "GK", rating: 82 },
    { name: "Matheus Donelli", position: "GK", rating: 77 },
    { name: "Felipe Longo", position: "GK", rating: 75 },
    { name: "Kauê", position: "GK", rating: 75 },
    { name: "Tchoca", position: "DF", rating: 79 },
    { name: "André Ramalho", position: "DF", rating: 75 },
    { name: "Gustavo Henrique", position: "DF", rating: 75 },
    { name: "Gabriel Paulista", position: "DF", rating: 75 },
    { name: "Renato Santos", position: "DF", rating: 75 },
    { name: "Matheus Bidu", position: "DF", rating: 81 },
    { name: "Hugo", position: "DF", rating: 75 },
    { name: "Fabrizio Angileri", position: "DF", rating: 75 },
    { name: "Matheuzinho", position: "DF", rating: 81 },
    { name: "Pedro Milans", position: "DF", rating: 78 },
    { name: "Raniele", position: "MF", rating: 79 },
    { name: "Allan", position: "MF", rating: 78 },
    { name: "Charles", position: "MF", rating: 75 },
    { name: "Breno Bidon", position: "MF", rating: 83 },
    { name: "André", position: "MF", rating: 83 },
    { name: "Matheus Pereira", position: "MF", rating: 78 },
    { name: "Alex Santana", position: "MF", rating: 77 },
    { name: "André Carrillo", position: "MF", rating: 75 },
    { name: "Bahia", position: "MF", rating: 75 },
    { name: "Rodrigo Garro", position: "MF", rating: 82 },
    { name: "Jesse Lingard", position: "MF", rating: 78 },
    { name: "Zakaria Labyad", position: "MF", rating: 75 },
    { name: "Kayke", position: "FW", rating: 78 },
    { name: "Vitinho", position: "FW", rating: 75 },
    { name: "Kaio César", position: "FW", rating: 79 },
    { name: "Dieguinho", position: "FW", rating: 79 },
    { name: "Yuri Alberto", position: "FW", rating: 83 },
    { name: "Memphis Depay", position: "FW", rating: 81 },
    { name: "Gui Negão", position: "FW", rating: 81 },
    { name: "Pedro Raul", position: "FW", rating: 78 }
  ],
  coritiba: [
    { name: "Pedro Morisco", position: "GK", rating: 80 },
    { name: "Pedro Rangel", position: "GK", rating: 77 },
    { name: "Keiller", position: "GK", rating: 75 },
    { name: "Benassi", position: "GK", rating: 75 },
    { name: "Jacy", position: "DF", rating: 78 },
    { name: "Tiago Cóser", position: "DF", rating: 78 },
    { name: "Maicon", position: "DF", rating: 75 },
    { name: "Rodrigo Moledo", position: "DF", rating: 75 },
    { name: "Thiago Santos", position: "DF", rating: 75 },
    { name: "Felipe Jonatan", position: "DF", rating: 78 },
    { name: "João Almeida", position: "DF", rating: 75 },
    { name: "Bruno Melo", position: "DF", rating: 75 },
    { name: "JP Chermont", position: "DF", rating: 79 },
    { name: "Tinga", position: "DF", rating: 75 },
    { name: "Vini Paulista", position: "MF", rating: 77 },
    { name: "Wallisson", position: "MF", rating: 75 },
    { name: "Willian Oliveira", position: "MF", rating: 75 },
    { name: "Sebastián Gómez", position: "MF", rating: 78 },
    { name: "Fernando Sobral", position: "MF", rating: 78 },
    { name: "Geovane Meurer", position: "MF", rating: 75 },
    { name: "Gustavo", position: "MF", rating: 75 },
    { name: "Josué", position: "MF", rating: 75 },
    { name: "Joaquín Lavega", position: "FW", rating: 79 },
    { name: "Breno Lopes", position: "FW", rating: 79 },
    { name: "Brian Ocampo", position: "FW", rating: 77 },
    { name: "Keno", position: "FW", rating: 75 },
    { name: "Lucas Ronier", position: "FW", rating: 80 },
    { name: "Fabinho", position: "FW", rating: 77 },
    { name: "Pedro Rocha", position: "FW", rating: 78 },
    { name: "Renato Marques", position: "FW", rating: 77 },
    { name: "Rodrigo Rodrigues", position: "FW", rating: 75 },
    { name: "Éberth", position: "FW", rating: 75 }
  ],
  cruzeiro: [
    { name: "Matheus Cunha", position: "GK", rating: 79 },
    { name: "Léo Aragão", position: "GK", rating: 75 },
    { name: "Otávio Costa", position: "GK", rating: 75 },
    { name: "Cássio", position: "GK", rating: 75 },
    { name: "Fabrício Bruno", position: "DF", rating: 82 },
    { name: "Jonathan Jesus", position: "DF", rating: 81 },
    { name: "João Marcelo", position: "DF", rating: 79 },
    { name: "Lucas Villalba", position: "DF", rating: 78 },
    { name: "Pedrão", position: "DF", rating: 75 },
    { name: "Kauã Prates", position: "DF", rating: 82 },
    { name: "Gabriel Rojas", position: "DF", rating: 79 },
    { name: "William", position: "DF", rating: 79 },
    { name: "Kauã Moraes", position: "DF", rating: 78 },
    { name: "Fagner", position: "DF", rating: 75 },
    { name: "Lucas Romero", position: "MF", rating: 78 },
    { name: "Murilo Rhikman", position: "MF", rating: 75 },
    { name: "Lucas Silva", position: "MF", rating: 75 },
    { name: "Gerson", position: "MF", rating: 83 },
    { name: "Matheus Henrique", position: "MF", rating: 79 },
    { name: "Fabrizio Peralta", position: "MF", rating: 75 },
    { name: "Matheus Pereira", position: "MF", rating: 82 },
    { name: "Gui Meira", position: "MF", rating: 75 },
    { name: "Luis Sinisterra", position: "FW", rating: 82 },
    { name: "Kaique Kenji", position: "FW", rating: 79 },
    { name: "Wanderson", position: "FW", rating: 79 },
    { name: "Bruno Rodrigues", position: "FW", rating: 77 },
    { name: "Keny Arroyo", position: "FW", rating: 82 },
    { name: "Marquinhos", position: "FW", rating: 78 },
    { name: "Kaio Jorge", position: "FW", rating: 85 },
    { name: "Néiser Villarreal", position: "FW", rating: 79 },
    { name: "Lautaro Díaz", position: "FW", rating: 78 },
    { name: "Chico da Costa", position: "FW", rating: 77 }
  ],
  flamengo: [
    { name: "Agustín Rossi", position: "GK", rating: 82 },
    { name: "Andrew", position: "GK", rating: 80 },
    { name: "Dyogo Alves", position: "GK", rating: 75 },
    { name: "Léo Ortiz", position: "DF", rating: 82 },
    { name: "Léo Pereira", position: "DF", rating: 82 },
    { name: "Vitão", position: "DF", rating: 82 },
    { name: "Danilo", position: "DF", rating: 78 },
    { name: "João Souza", position: "DF", rating: 75 },
    { name: "Ayrton Lucas", position: "DF", rating: 79 },
    { name: "Alex Sandro", position: "DF", rating: 77 },
    { name: "Emerson Royal", position: "DF", rating: 80 },
    { name: "Guillermo Varela", position: "DF", rating: 77 },
    { name: "Evertton Araújo", position: "MF", rating: 82 },
    { name: "Erick Pulgar", position: "MF", rating: 79 },
    { name: "Jorginho", position: "MF", rating: 79 },
    { name: "Nicolás de la Cruz", position: "MF", rating: 81 },
    { name: "Saúl Ñíguez", position: "MF", rating: 77 },
    { name: "Lucas Paquetá", position: "MF", rating: 85 },
    { name: "Giorgian de Arrascaeta", position: "MF", rating: 82 },
    { name: "Jorge Carrascal", position: "MF", rating: 82 },
    { name: "Lorran", position: "MF", rating: 79 },
    { name: "Samuel Lino", position: "FW", rating: 83 },
    { name: "Everton", position: "FW", rating: 81 },
    { name: "Gonzalo Plata", position: "FW", rating: 81 },
    { name: "Luiz Araújo", position: "FW", rating: 81 },
    { name: "Pedro", position: "FW", rating: 83 },
    { name: "Wallace Yan", position: "FW", rating: 80 },
    { name: "Bruno Henrique", position: "FW", rating: 75 }
  ],
  fluminense: [
    { name: "Vitor Eudes", position: "GK", rating: 75 },
    { name: "Marcelo Pitaluga", position: "GK", rating: 75 },
    { name: "Fábio", position: "GK", rating: 75 },
    { name: "Juan Pablo Freytes", position: "DF", rating: 80 },
    { name: "Julián Millán", position: "DF", rating: 79 },
    { name: "Jemmes", position: "DF", rating: 79 },
    { name: "Ignácio", position: "DF", rating: 78 },
    { name: "Igor Rabello", position: "DF", rating: 77 },
    { name: "Thiago Silva", position: "DF", rating: 75 },
    { name: "Davi Schuindt", position: "DF", rating: 75 },
    { name: "Guilherme Arana", position: "DF", rating: 80 },
    { name: "Renê", position: "DF", rating: 75 },
    { name: "Guga", position: "DF", rating: 78 },
    { name: "Julio Fidelis", position: "DF", rating: 75 },
    { name: "Samuel Xavier", position: "DF", rating: 75 },
    { name: "Martinelli", position: "MF", rating: 83 },
    { name: "Otávio", position: "MF", rating: 77 },
    { name: "Hércules", position: "MF", rating: 83 },
    { name: "Nonato", position: "MF", rating: 78 },
    { name: "Alisson", position: "MF", rating: 75 },
    { name: "Jefferson Savarino", position: "MF", rating: 81 },
    { name: "Luciano Acosta", position: "MF", rating: 80 },
    { name: "David Terans", position: "MF", rating: 77 },
    { name: "Ganso", position: "MF", rating: 75 },
    { name: "Yeferson Soteldo", position: "FW", rating: 79 },
    { name: "Matheus Reis", position: "FW", rating: 75 },
    { name: "Agustín Canobbio", position: "FW", rating: 81 },
    { name: "Riquelme", position: "FW", rating: 80 },
    { name: "Kevin Serna", position: "FW", rating: 80 },
    { name: "John Kennedy", position: "FW", rating: 81 },
    { name: "Rodrigo Castillo", position: "FW", rating: 80 },
    { name: "Hulk", position: "FW", rating: 77 },
    { name: "Germán Cano", position: "FW", rating: 75 }
  ],
  fortaleza: [
    { name: "Brenno", position: "GK", rating: 75 },
    { name: "João Ricardo", position: "GK", rating: 75 },
    { name: "Magrão", position: "GK", rating: 74 },
    { name: "Vinícius", position: "GK", rating: 74 },
    { name: "Lucas Gazal", position: "DF", rating: 77 },
    { name: "Tomás Cardona", position: "DF", rating: 76 },
    { name: "Luan Freitas", position: "DF", rating: 75 },
    { name: "Kauã Rocha", position: "DF", rating: 74 },
    { name: "Neris", position: "DF", rating: 74 },
    { name: "Gabriel Fuentes", position: "DF", rating: 78 },
    { name: "Maurício Mucuri", position: "DF", rating: 75 },
    { name: "Maílton", position: "DF", rating: 78 },
    { name: "Paulinho", position: "DF", rating: 74 },
    { name: "Ryan", position: "MF", rating: 80 },
    { name: "Ronald", position: "MF", rating: 78 },
    { name: "Rodrigo Santos", position: "MF", rating: 75 },
    { name: "Lucas Sasha", position: "MF", rating: 74 },
    { name: "Pierre", position: "MF", rating: 77 },
    { name: "Matheus Rossetto", position: "MF", rating: 77 },
    { name: "Calebe", position: "MF", rating: 78 },
    { name: "Lucca Prior", position: "MF", rating: 75 },
    { name: "Lucas Crispim", position: "MF", rating: 75 },
    { name: "Lucas Emanoel", position: "MF", rating: 74 },
    { name: "Luiz Fernando", position: "FW", rating: 78 },
    { name: "Rodriguinho", position: "FW", rating: 76 },
    { name: "Paulo Baya", position: "FW", rating: 76 },
    { name: "Vitinho", position: "FW", rating: 80 },
    { name: "Welliton", position: "FW", rating: 76 },
    { name: "Pedro Henrique", position: "FW", rating: 74 },
    { name: "Imanol Machuca", position: "FW", rating: 74 },
    { name: "Juan Miritello", position: "FW", rating: 78 },
    { name: "GB", position: "FW", rating: 78 }
  ],
  gremio: [
    { name: "Gabriel Grando", position: "GK", rating: 78 },
    { name: "Weverton", position: "GK", rating: 75 },
    { name: "Thiago Beltrame", position: "GK", rating: 75 },
    { name: "Gabriel Menegon", position: "GK", rating: 75 },
    { name: "Gustavo Martins", position: "DF", rating: 79 },
    { name: "Wagner Leonardo", position: "DF", rating: 79 },
    { name: "Fabián Balbuena", position: "DF", rating: 75 },
    { name: "Walter Kannemann", position: "DF", rating: 75 },
    { name: "Wallace", position: "DF", rating: 75 },
    { name: "Luis Eduardo", position: "DF", rating: 75 },
    { name: "Marlon", position: "DF", rating: 79 },
    { name: "Caio Paulista", position: "DF", rating: 78 },
    { name: "Pedro Gabriel", position: "DF", rating: 78 },
    { name: "Cristian Pavón", position: "DF", rating: 78 },
    { name: "João Pedro", position: "DF", rating: 78 },
    { name: "Marcos Rocha", position: "DF", rating: 75 },
    { name: "Leonel Pérez", position: "MF", rating: 80 },
    { name: "Erick Noriega", position: "MF", rating: 80 },
    { name: "Mathías Villasanti", position: "MF", rating: 79 },
    { name: "Dodi", position: "MF", rating: 75 },
    { name: "Juan Nardoni", position: "MF", rating: 81 },
    { name: "Tiaguinho", position: "MF", rating: 75 },
    { name: "Gabriel Mec", position: "MF", rating: 83 },
    { name: "Miguel Monsalve", position: "MF", rating: 79 },
    { name: "Riquelme", position: "MF", rating: 78 },
    { name: "Francis Amuzu", position: "FW", rating: 81 },
    { name: "Willian", position: "FW", rating: 75 },
    { name: "Tetê", position: "FW", rating: 81 },
    { name: "José Enamorado", position: "FW", rating: 79 },
    { name: "Roger", position: "FW", rating: 75 },
    { name: "Carlos Vinícius", position: "FW", rating: 81 },
    { name: "Matheus Nascimento", position: "FW", rating: 78 },
    { name: "Martin Braithwaite", position: "FW", rating: 77 }
  ],
  internacional: [
    { name: "Anthoni", position: "GK", rating: 79 },
    { name: "Sergio Rochet", position: "GK", rating: 78 },
    { name: "Henrique Menke", position: "GK", rating: 78 },
    { name: "Kauan", position: "GK", rating: 75 },
    { name: "Diego Esser", position: "GK", rating: 75 },
    { name: "Victor Gabriel", position: "DF", rating: 80 },
    { name: "Guillermo Maripán", position: "DF", rating: 78 },
    { name: "Félix Torres", position: "DF", rating: 77 },
    { name: "Juninho", position: "DF", rating: 75 },
    { name: "Clayton", position: "DF", rating: 75 },
    { name: "Gabriel Mercado", position: "DF", rating: 75 },
    { name: "Alexandro Bernabei", position: "DF", rating: 81 },
    { name: "Matheus Bahia", position: "DF", rating: 79 },
    { name: "Bruno Gomes", position: "DF", rating: 80 },
    { name: "Braian Aguirre", position: "DF", rating: 78 },
    { name: "Rodrigo Villagra", position: "MF", rating: 79 },
    { name: "Thiago Maia", position: "MF", rating: 78 },
    { name: "Ronaldo", position: "MF", rating: 78 },
    { name: "Richard", position: "MF", rating: 75 },
    { name: "Benjamin", position: "MF", rating: 75 },
    { name: "Alan Rodríguez", position: "MF", rating: 78 },
    { name: "Paulinho Paula", position: "MF", rating: 77 },
    { name: "Bruno Henrique", position: "MF", rating: 75 },
    { name: "Alan Patrick", position: "MF", rating: 78 },
    { name: "Allex", position: "MF", rating: 77 },
    { name: "Yago Noal", position: "MF", rating: 75 },
    { name: "Estêvão", position: "MF", rating: 75 },
    { name: "Johan Carbonero", position: "FW", rating: 80 },
    { name: "Vitinho", position: "FW", rating: 80 },
    { name: "Kayky", position: "FW", rating: 80 },
    { name: "Bruno Tabata", position: "FW", rating: 78 },
    { name: "Alerrandro", position: "FW", rating: 79 },
    { name: "Raykkonen", position: "FW", rating: 77 }
  ],
  mirassol: [
    { name: "Walter", position: "GK", rating: 75 },
    { name: "Alex Muralha", position: "GK", rating: 74 },
    { name: "Reinaldo", position: "DF", rating: 75 },
    { name: "Victor Luis", position: "DF", rating: 75 },
    { name: "Bruno Santos", position: "DF", rating: 74 },
    { name: "Chico Kim", position: "MF", rating: 74 },
    { name: "Gabriel Pires", position: "MF", rating: 75 },
    { name: "Neto Moura", position: "MF", rating: 78 },
    { name: "Eduardo", position: "MF", rating: 76 },
    { name: "Nathan Fogaça", position: "FW", rating: 74 },
    { name: "Negueba", position: "FW", rating: 80 },
    { name: "Tiquinho Soares", position: "FW", rating: 76 },
    { name: "Alesson", position: "FW", rating: 78 },
    { name: "Carlos Eduardo", position: "FW", rating: 75 },
    { name: "André Luis", position: "FW", rating: 77 }
  ],
  palmeiras: [
    { name: "Carlos Miguel", position: "GK", rating: 81 },
    { name: "Kaique Pereira", position: "GK", rating: 78 },
    { name: "Marcelo Lomba", position: "GK", rating: 75 },
    { name: "Alexander Barboza", position: "DF", rating: 80 },
    { name: "Murilo", position: "DF", rating: 80 },
    { name: "Naves", position: "DF", rating: 79 },
    { name: "Bruno Fuchs", position: "DF", rating: 79 },
    { name: "Luis Benedetti", position: "DF", rating: 79 },
    { name: "Gustavo Gómez", position: "DF", rating: 79 },
    { name: "Joaquín Piquerez", position: "DF", rating: 82 },
    { name: "Jefté", position: "DF", rating: 79 },
    { name: "Arthur Gabriel", position: "DF", rating: 79 },
    { name: "Agustín Giay", position: "DF", rating: 82 },
    { name: "Khellven", position: "DF", rating: 80 },
    { name: "Emiliano Martínez", position: "MF", rating: 80 },
    { name: "Marlon Freitas", position: "MF", rating: 80 },
    { name: "Luis Pacheco", position: "MF", rating: 75 },
    { name: "Andreas Pereira", position: "MF", rating: 82 },
    { name: "Lucas Evangelista", position: "MF", rating: 79 },
    { name: "Larson", position: "MF", rating: 75 },
    { name: "Mauricio", position: "MF", rating: 83 },
    { name: "Erick Belé", position: "MF", rating: 77 },
    { name: "Felipe Anderson", position: "FW", rating: 78 },
    { name: "Riquelme Fillipi", position: "FW", rating: 77 },
    { name: "Allan", position: "FW", rating: 83 },
    { name: "Jhon Arias", position: "FW", rating: 83 },
    { name: "Ramón Sosa", position: "FW", rating: 82 },
    { name: "Paulinho", position: "FW", rating: 81 },
    { name: "Vitor Roque", position: "FW", rating: 85 },
    { name: "José Manuel López", position: "FW", rating: 85 },
    { name: "Luighi", position: "FW", rating: 79 }
  ],
  remo: [
    { name: "Ivan", position: "GK", rating: 78 },
    { name: "Marcelo Rangel", position: "GK", rating: 75 },
    { name: "Ygor Vinhas", position: "GK", rating: 75 },
    { name: "Tchamba", position: "DF", rating: 76 },
    { name: "Thalisson", position: "DF", rating: 75 },
    { name: "Léo Andrade", position: "DF", rating: 75 },
    { name: "Marllon", position: "DF", rating: 75 },
    { name: "Cristian Tassano", position: "DF", rating: 75 },
    { name: "Braian Cufré", position: "DF", rating: 78 },
    { name: "Mayk", position: "DF", rating: 75 },
    { name: "Edson Kauã", position: "DF", rating: 74 },
    { name: "João Lucas", position: "DF", rating: 78 },
    { name: "Matheus Alexandre", position: "DF", rating: 76 },
    { name: "Marcelinho", position: "DF", rating: 75 },
    { name: "Caio Magalhães", position: "DF", rating: 74 },
    { name: "Leonel Picco", position: "MF", rating: 80 },
    { name: "Zé Welison", position: "MF", rating: 78 },
    { name: "David Braga", position: "MF", rating: 75 },
    { name: "Edson Fernando", position: "MF", rating: 75 },
    { name: "Zé Ricardo", position: "MF", rating: 75 },
    { name: "Patrick", position: "MF", rating: 75 },
    { name: "Franco Catarozzi", position: "MF", rating: 75 },
    { name: "Vitor Bueno", position: "MF", rating: 78 },
    { name: "Jajá", position: "FW", rating: 76 },
    { name: "Jáderson", position: "FW", rating: 76 },
    { name: "Alef Manga", position: "FW", rating: 75 },
    { name: "Yago Pikachu", position: "FW", rating: 75 },
    { name: "Tico", position: "FW", rating: 74 },
    { name: "Gabriel Taliari", position: "FW", rating: 78 },
    { name: "Rafael Monti", position: "FW", rating: 75 },
    { name: "Gabriel Poveda", position: "FW", rating: 75 },
    { name: "Eduardo Melo", position: "FW", rating: 75 }
  ],
  santos: [
    { name: "Gabriel Brazão", position: "GK", rating: 82 },
    { name: "João Paulo", position: "GK", rating: 78 },
    { name: "Diógenes", position: "GK", rating: 75 },
    { name: "Rodrigo Falcão", position: "GK", rating: 75 },
    { name: "Lucas Veríssimo", position: "DF", rating: 79 },
    { name: "Adonis Frías", position: "DF", rating: 79 },
    { name: "Zé Ivaldo", position: "DF", rating: 78 },
    { name: "Alexis Duarte", position: "DF", rating: 78 },
    { name: "Luan Peres", position: "DF", rating: 75 },
    { name: "João Ananias", position: "DF", rating: 75 },
    { name: "Alex", position: "DF", rating: 75 },
    { name: "João Alencar", position: "DF", rating: 75 },
    { name: "Vinicius Lira", position: "DF", rating: 79 },
    { name: "Gonzalo Escobar", position: "DF", rating: 75 },
    { name: "Igor Vinícius", position: "DF", rating: 78 },
    { name: "Mayke", position: "DF", rating: 78 },
    { name: "Christian Oliva", position: "MF", rating: 77 },
    { name: "Willian Arão", position: "MF", rating: 75 },
    { name: "João Schmidt", position: "MF", rating: 75 },
    { name: "Gustavinho", position: "MF", rating: 75 },
    { name: "Gabriel Bontempo", position: "MF", rating: 81 },
    { name: "Gabriel Menino", position: "MF", rating: 81 },
    { name: "Zé Rafael", position: "MF", rating: 78 },
    { name: "Neymar", position: "MF", rating: 81 },
    { name: "Miguelito", position: "MF", rating: 80 },
    { name: "Thaciano", position: "MF", rating: 77 },
    { name: "Pepê Fermino", position: "MF", rating: 75 },
    { name: "Álvaro Barreal", position: "FW", rating: 81 },
    { name: "Moisés", position: "FW", rating: 78 },
    { name: "Gustavo Caballero", position: "FW", rating: 77 },
    { name: "Mateus Xavier", position: "FW", rating: 75 },
    { name: "Benjamín Rollheiser", position: "FW", rating: 81 },
    { name: "Robinho Junior", position: "FW", rating: 80 },
    { name: "Enzo Boer", position: "FW", rating: 75 },
    { name: "Rony", position: "FW", rating: 79 },
    { name: "Gabriel Barbosa", position: "FW", rating: 79 }
  ],
  sao_paulo: [
    { name: "Carlos Coronel", position: "GK", rating: 78 },
    { name: "Rafael", position: "GK", rating: 75 },
    { name: "Young", position: "GK", rating: 75 },
    { name: "João Pedro", position: "GK", rating: 75 },
    { name: "Felipe Preis", position: "GK", rating: 75 },
    { name: "Sabino", position: "DF", rating: 77 },
    { name: "Matheus Belém", position: "DF", rating: 75 },
    { name: "Rafael Tolói", position: "DF", rating: 75 },
    { name: "Robert Arboleda", position: "DF", rating: 75 },
    { name: "Isac", position: "DF", rating: 75 },
    { name: "Luis Osorio", position: "DF", rating: 75 },
    { name: "Enzo Díaz", position: "DF", rating: 79 },
    { name: "Wendell", position: "DF", rating: 78 },
    { name: "Nicolas", position: "DF", rating: 75 },
    { name: "Maik", position: "DF", rating: 78 },
    { name: "João Moreira", position: "DF", rating: 77 },
    { name: "Lucas Ramon", position: "DF", rating: 75 },
    { name: "Cédric Soares", position: "DF", rating: 75 },
    { name: "Igor Felisberto", position: "DF", rating: 75 },
    { name: "Pablo Maia", position: "MF", rating: 80 },
    { name: "Felipe Negrucci", position: "MF", rating: 77 },
    { name: "Luan", position: "MF", rating: 77 },
    { name: "Hugo Leonardo", position: "MF", rating: 75 },
    { name: "Marcos Antônio", position: "MF", rating: 82 },
    { name: "Damián Bobadilla", position: "MF", rating: 80 },
    { name: "Danielzinho", position: "MF", rating: 77 },
    { name: "Djhordney", position: "MF", rating: 75 },
    { name: "Cauly", position: "MF", rating: 79 },
    { name: "Pedro Ferreira", position: "MF", rating: 75 },
    { name: "Ferreirinha", position: "FW", rating: 79 },
    { name: "Lucca", position: "FW", rating: 79 },
    { name: "Victor Sá", position: "FW", rating: 78 },
    { name: "Tetê", position: "FW", rating: 77 },
    { name: "Artur", position: "FW", rating: 81 },
    { name: "Lucas Moura", position: "FW", rating: 78 },
    { name: "Ryan Francisco", position: "FW", rating: 79 },
    { name: "Gonzalo Tapia", position: "FW", rating: 79 },
    { name: "André Silva", position: "FW", rating: 79 },
    { name: "Jonathan Calleri", position: "FW", rating: 78 },
    { name: "Luciano", position: "FW", rating: 77 },
    { name: "Paulinho", position: "FW", rating: 75 }
  ],
  vasco: [
    { name: "Léo Jardim", position: "GK", rating: 81 },
    { name: "Daniel Fuzato", position: "GK", rating: 75 },
    { name: "Pablo", position: "GK", rating: 75 },
    { name: "Robert Renan", position: "DF", rating: 82 },
    { name: "Carlos Cuesta", position: "DF", rating: 81 },
    { name: "Alan Saldivia", position: "DF", rating: 77 },
    { name: "Lucas Freitas", position: "DF", rating: 77 },
    { name: "Walace Falcão", position: "DF", rating: 75 },
    { name: "Cuiabano", position: "DF", rating: 82 },
    { name: "Lucas Piton", position: "DF", rating: 80 },
    { name: "Riquelme", position: "DF", rating: 75 },
    { name: "Paulinho", position: "DF", rating: 75 },
    { name: "Paulo Henrique", position: "DF", rating: 80 },
    { name: "José Luis Rodríguez", position: "DF", rating: 78 },
    { name: "JV Fonseca", position: "DF", rating: 75 },
    { name: "Cauan Barros", position: "MF", rating: 80 },
    { name: "Thiago Mendes", position: "MF", rating: 77 },
    { name: "Mateus Carvalho", position: "MF", rating: 77 },
    { name: "Hugo Moura", position: "MF", rating: 77 },
    { name: "Jair", position: "MF", rating: 75 },
    { name: "JP", position: "MF", rating: 78 },
    { name: "Tchê Tchê", position: "MF", rating: 75 },
    { name: "Johan Rojas", position: "MF", rating: 79 },
    { name: "Guilherme Estrella", position: "MF", rating: 77 },
    { name: "Lukas Zuccarello", position: "MF", rating: 75 },
    { name: "Andrés Gómez", position: "FW", rating: 82 },
    { name: "David", position: "FW", rating: 78 },
    { name: "Nuno Moreira", position: "FW", rating: 81 },
    { name: "Marino Hinestroza", position: "FW", rating: 79 },
    { name: "Adson", position: "FW", rating: 78 },
    { name: "Loide Augusto", position: "FW", rating: 77 },
    { name: "Brenner", position: "FW", rating: 79 },
    { name: "Claudio Spinelli", position: "FW", rating: 79 }
  ],
  vitoria: [
    { name: "Lucas Arcanjo", position: "GK", rating: 78 },
    { name: "Gabriel", position: "GK", rating: 75 },
    { name: "Yuri Sena", position: "GK", rating: 74 },
    { name: "Luan Cândido", position: "DF", rating: 80 },
    { name: "Riccieli", position: "DF", rating: 78 },
    { name: "Cacá", position: "DF", rating: 77 },
    { name: "Ramon", position: "DF", rating: 78 },
    { name: "Claudinho", position: "DF", rating: 77 },
    { name: "Camutanga", position: "DF", rating: 74 },
    { name: "Matheuzinho", position: "MF", rating: 80 },
    { name: "Baralhas", position: "MF", rating: 78 },
    { name: "Erick", position: "FW", rating: 78 },
    { name: "Diego Tarzia", position: "FW", rating: 78 },
    { name: "Renato Kayzer", position: "FW", rating: 77 },
    { name: "Osvaldo", position: "FW", rating: 74 }
  ]
};

export const CLUB_DEFINITIONS: ClubDefinition[] = [
  // --- SERIE A ---
  { id: 'palmeiras', name: 'Palmeiras', division: 'A', primaryColor: '#006437', secondaryColor: '#FFFFFF', textColor: '#FFFFFF', stadiumCapacity: 43000, stadiumName: 'Allianz Parque', reputation: 90, stars: STAR_PLAYERS.palmeiras },
  { id: 'flamengo', name: 'Flamengo', division: 'A', primaryColor: '#C41C1C', secondaryColor: '#121212', textColor: '#FFFFFF', stadiumCapacity: 78000, stadiumName: 'Maracana', reputation: 92, stars: STAR_PLAYERS.flamengo },
  { id: 'botafogo', name: 'Botafogo', division: 'A', primaryColor: '#111111', secondaryColor: '#FFFFFF', textColor: '#FFFFFF', stadiumCapacity: 44000, stadiumName: 'Nilton Santos', reputation: 88, stars: STAR_PLAYERS.botafogo },
  { id: 'sao_paulo', name: 'Sao Paulo', division: 'A', primaryColor: '#DA251C', secondaryColor: '#000000', textColor: '#FFFFFF', stadiumCapacity: 66000, stadiumName: 'Morumbis', reputation: 87, stars: STAR_PLAYERS.sao_paulo },
  { id: 'corinthians', name: 'Corinthians', division: 'A', primaryColor: '#1A1A1A', secondaryColor: '#FFFFFF', textColor: '#FFFFFF', stadiumCapacity: 49000, stadiumName: 'Neo Quimica Arena', reputation: 86, stars: STAR_PLAYERS.corinthians },
  { id: 'fluminense', name: 'Fluminense', division: 'A', primaryColor: '#800020', secondaryColor: '#006437', textColor: '#FFFFFF', stadiumCapacity: 78000, stadiumName: 'Maracana', reputation: 84, stars: STAR_PLAYERS.fluminense },
  { id: 'gremio', name: 'Gremio', division: 'A', primaryColor: '#0D80BF', secondaryColor: '#FFFFFF', textColor: '#FFFFFF', stadiumCapacity: 55000, stadiumName: 'Arena do Gremio', reputation: 85, stars: STAR_PLAYERS.gremio },
  { id: 'internacional', name: 'Internacional', division: 'A', primaryColor: '#E11B22', secondaryColor: '#FFFFFF', textColor: '#FFFFFF', stadiumCapacity: 50000, stadiumName: 'Beira-Rio', reputation: 85, stars: STAR_PLAYERS.internacional },
  { id: 'atletico_mg', name: 'Atletico-MG', division: 'A', primaryColor: '#151515', secondaryColor: '#FFFFFF', textColor: '#FFFFFF', stadiumCapacity: 46000, stadiumName: 'Arena MRV', reputation: 87, stars: STAR_PLAYERS.atletico_mg },
  { id: 'cruzeiro', name: 'Cruzeiro', division: 'A', primaryColor: '#0033A0', secondaryColor: '#FFFFFF', textColor: '#FFFFFF', stadiumCapacity: 61000, stadiumName: 'Mineirao', reputation: 84, stars: STAR_PLAYERS.cruzeiro },
  { id: 'bahia', name: 'Bahia', division: 'A', primaryColor: '#0047AB', secondaryColor: '#D81E05', textColor: '#FFFFFF', stadiumCapacity: 48000, stadiumName: 'Fonte Nova', reputation: 82, stars: STAR_PLAYERS.bahia },
  { id: 'vasco', name: 'Vasco da Gama', division: 'A', primaryColor: '#1E1E1E', secondaryColor: '#FFFFFF', textColor: '#FFFFFF', stadiumCapacity: 22000, stadiumName: 'Sao Januario', reputation: 83, stars: STAR_PLAYERS.vasco },
  { id: 'santos', name: 'Santos', division: 'A', primaryColor: '#FFFFFF', secondaryColor: '#121212', textColor: '#000000', stadiumCapacity: 16000, stadiumName: 'Vila Belmiro', reputation: 84, stars: STAR_PLAYERS.santos },
  { id: 'athletico_pr', name: 'Athletico-PR', division: 'A', primaryColor: '#DE1921', secondaryColor: '#000000', textColor: '#FFFFFF', stadiumCapacity: 42000, stadiumName: 'Ligga Arena', reputation: 83, stars: STAR_PLAYERS.athletico_pr },
  { id: 'bragantino', name: 'Red Bull Bragantino', division: 'A', primaryColor: '#E20037', secondaryColor: '#FFFFFF', textColor: '#FFFFFF', stadiumCapacity: 17000, stadiumName: 'Nabizao', reputation: 80, stars: STAR_PLAYERS.bragantino },
  { id: 'chapecoense', name: 'Chapecoense', division: 'A', primaryColor: '#007A33', secondaryColor: '#FFFFFF', textColor: '#FFFFFF', stadiumCapacity: 20000, stadiumName: 'Arena Conda', reputation: 74, stars: STAR_PLAYERS.chapecoense },
  { id: 'coritiba', name: 'Coritiba', division: 'A', primaryColor: '#005432', secondaryColor: '#FFFFFF', textColor: '#FFFFFF', stadiumCapacity: 38000, stadiumName: 'Couto Pereira', reputation: 76, stars: STAR_PLAYERS.coritiba },
  { id: 'mirassol', name: 'Mirassol', division: 'A', primaryColor: '#FFD700', secondaryColor: '#006437', textColor: '#000000', stadiumCapacity: 15000, stadiumName: 'Maião', reputation: 72, stars: STAR_PLAYERS.mirassol },
  { id: 'remo', name: 'Remo', division: 'A', primaryColor: '#001A3F', secondaryColor: '#FFFFFF', textColor: '#FFFFFF', stadiumCapacity: 14000, stadiumName: 'Baenão', reputation: 70, stars: STAR_PLAYERS.remo },
  { id: 'vitoria', name: 'Vitoria', division: 'A', primaryColor: '#D32F2F', secondaryColor: '#212121', textColor: '#FFFFFF', stadiumCapacity: 35000, stadiumName: 'Barradão', reputation: 75, stars: STAR_PLAYERS.vitoria },

  // --- SERIE B ---
  { id: 'america_mg', name: 'America-MG', division: 'B', primaryColor: '#008000', secondaryColor: '#121212', textColor: '#FFFFFF', stadiumCapacity: 23000, stadiumName: 'Independencia', reputation: 75, stars: [
    { name: "Dalbert", position: "DF", rating: 74 },
    { name: "Ricardo Silva", position: "DF", rating: 73 },
    { name: "Alê", position: "MF", rating: 74 },
    { name: "Mastriani", position: "FW", rating: 76 },
    { name: "Segovinha", position: "FW", rating: 74 }
  ] },
  { id: 'athletic_mg', name: 'Athletic Club', division: 'B', primaryColor: '#111111', secondaryColor: '#FFFFFF', textColor: '#FFFFFF', stadiumCapacity: 6000, stadiumName: 'Arena Unimed', reputation: 65, stars: [
    { name: "Danilo Cardoso", position: "DF", rating: 66 },
    { name: "Wallisson", position: "MF", rating: 68 },
    { name: "Welinton Torrao", position: "FW", rating: 67 }
  ] },
  { id: 'atletico_go', name: 'Atletico-GO', division: 'B', primaryColor: '#D32F2F', secondaryColor: '#111111', textColor: '#FFFFFF', stadiumCapacity: 12000, stadiumName: 'Accioly', reputation: 73, stars: [
    { name: "Ronaldo", position: "GK", rating: 73 },
    { name: "Alix Vinicius", position: "DF", rating: 74 },
    { name: "Shaylon", position: "MF", rating: 75 },
    { name: "Luiz Fernando", position: "FW", rating: 75 }
  ] },
  { id: 'avai', name: 'Avai', division: 'B', primaryColor: '#1976D2', secondaryColor: '#FFFFFF', textColor: '#FFFFFF', stadiumCapacity: 17800, stadiumName: 'Ressacada', reputation: 70, stars: [
    { name: "Cesar Augusto", position: "GK", rating: 70 },
    { name: "Tiago Pagnussat", position: "DF", rating: 70 },
    { name: "Giovanni", position: "MF", rating: 72 },
    { name: "Mauricio Garcez", position: "FW", rating: 71 }
  ] },
  { id: 'botafogo_sp', name: 'Botafogo-SP', division: 'B', primaryColor: '#C2185B', secondaryColor: '#FFFFFF', textColor: '#FFFFFF', stadiumCapacity: 28000, stadiumName: 'Santa Cruz', reputation: 66, stars: [
    { name: "Matheus Costa", position: "DF", rating: 67 },
    { name: "Gustavo Bochecha", position: "MF", rating: 68 },
    { name: "Alex Sandro", position: "FW", rating: 67 }
  ] },
  { id: 'ceara', name: 'Ceara', division: 'B', primaryColor: '#111111', secondaryColor: '#FFFFFF', textColor: '#FFFFFF', stadiumCapacity: 63000, stadiumName: 'Castelao', reputation: 76, stars: [
    { name: "Richard", position: "GK", rating: 74 },
    { name: "Luiz Otávio", position: "DF", rating: 73 },
    { name: "Vina", position: "MF", rating: 75 },
    { name: "Matheus Bahia", position: "DF", rating: 72 },
    { name: "Wendel Silva", position: "FW", rating: 74 }
  ] },
  { id: 'crb', name: 'CRB', division: 'B', primaryColor: '#D32F2F', secondaryColor: '#FFFFFF', textColor: '#FFFFFF', stadiumCapacity: 18000, stadiumName: 'Rei Pele', reputation: 67, stars: [
    { name: "Matheus Albino", position: "GK", rating: 69 },
    { name: "Fabio Alemao", position: "DF", rating: 68 },
    { name: "Gegê", position: "MF", rating: 71 },
    { name: "Anselmo Ramon", position: "FW", rating: 73 }
  ] },
  { id: 'criciuma', name: 'Criciuma', division: 'B', primaryColor: '#FBC02D', secondaryColor: '#111111', textColor: '#000000', stadiumCapacity: 19000, stadiumName: 'Heriberto Hulse', reputation: 72, stars: [
    { name: "Marcelo Hermes", position: "DF", rating: 73 },
    { name: "Fellipe Mateus", position: "MF", rating: 73 },
    { name: "Sandry", position: "MF", rating: 74 },
    { name: "Rómulo Otero", position: "FW", rating: 74 }
  ] },
  { id: 'cuiaba', name: 'Cuiaba', division: 'B', primaryColor: '#388E3C', secondaryColor: '#FBC02D', textColor: '#FFFFFF', stadiumCapacity: 41000, stadiumName: 'Arena Pantanal', reputation: 74, stars: [
    { name: "Marcelo Carné", position: "GK", rating: 72 },
    { name: "Alan Empereur", position: "DF", rating: 74 },
    { name: "Lucas Fernandes", position: "MF", rating: 73 },
    { name: "Deyverson", position: "FW", rating: 75 }
  ] },
  { id: 'fortaleza', name: 'Fortaleza', division: 'B', primaryColor: '#1976D2', secondaryColor: '#D32F2F', textColor: '#FFFFFF', stadiumCapacity: 63000, stadiumName: 'Castelao', reputation: 81, stars: [
    { name: "Brenno", position: "GK", rating: 75 },
    { name: "João Ricardo", position: "GK", rating: 75 },
    { name: "Gabriel Fuentes", position: "DF", rating: 78 },
    { name: "Ryan", position: "MF", rating: 80 },
    { name: "Vitinho", position: "FW", rating: 80 }
  ] },
  { id: 'goias', name: 'Goias', division: 'B', primaryColor: '#1B5E20', secondaryColor: '#FFFFFF', textColor: '#FFFFFF', stadiumCapacity: 14000, stadiumName: 'Serrinha', reputation: 74, stars: [
    { name: "Tadeu", position: "GK", rating: 76 },
    { name: "Sander", position: "DF", rating: 72 },
    { name: "Wellington Rato", position: "MF", rating: 75 },
    { name: "Lucas Lima", position: "MF", rating: 74 },
    { name: "Angelo Rodriguez", position: "FW", rating: 73 }
  ] },
  { id: 'juventude', name: 'Juventude', division: 'B', primaryColor: '#2E7D32', secondaryColor: '#FFFFFF', textColor: '#FFFFFF', stadiumCapacity: 19000, stadiumName: 'Alfredo Jaconi', reputation: 72, stars: [
    { name: "Jandrei", position: "GK", rating: 74 },
    { name: "Danilo Boza", position: "DF", rating: 72 },
    { name: "Nenê", position: "MF", rating: 73 },
    { name: "Lucas Barbosa", position: "FW", rating: 74 }
  ] },
  { id: 'londrina', name: 'Londrina', division: 'B', primaryColor: '#03A9F4', secondaryColor: '#FFFFFF', textColor: '#FFFFFF', stadiumCapacity: 30000, stadiumName: 'Estadio do Cafe', reputation: 66, stars: [
    { name: "Iago Teles", position: "FW", rating: 67 },
    { name: "Rafael Longuine", position: "MF", rating: 68 }
  ] },
  { id: 'nautico', name: 'Nautico', division: 'B', primaryColor: '#D32F2F', secondaryColor: '#FFFFFF', textColor: '#FFFFFF', stadiumCapacity: 20000, stadiumName: 'Aflitos', reputation: 69, stars: [
    { name: "Vagner", position: "GK", rating: 68 },
    { name: "Diego Matos", position: "DF", rating: 67 },
    { name: "Paulo Sergio", position: "FW", rating: 70 }
  ] },
  { id: 'novorizontino', name: 'Novorizontino', division: 'B', primaryColor: '#FFD54F', secondaryColor: '#111111', textColor: '#000000', stadiumCapacity: 16000, stadiumName: 'Jorjao', reputation: 70, stars: [
    { name: "Jordi", position: "GK", rating: 71 },
    { name: "Cesar Martins", position: "DF", rating: 70 },
    { name: "Marlon", position: "MF", rating: 70 },
    { name: "Neto Pessoa", position: "FW", rating: 71 }
  ] },
  { id: 'operario_pr', name: 'Operario-PR', division: 'B', primaryColor: '#111111', secondaryColor: '#FFFFFF', textColor: '#FFFFFF', stadiumCapacity: 10000, stadiumName: 'Germano Kruger', reputation: 65, stars: [
    { name: "Rafael Santos", position: "GK", rating: 68 },
    { name: "Willian Machado", position: "DF", rating: 67 },
    { name: "Felipe Augusto", position: "FW", rating: 68 }
  ] },
  { id: 'ponte_preta', name: 'Ponte Preta', division: 'B', primaryColor: '#FFFFFF', secondaryColor: '#111111', textColor: '#000000', stadiumCapacity: 17000, stadiumName: 'Majestoso', reputation: 69, stars: [
    { name: "Pedro Rocha", position: "GK", rating: 68 },
    { name: "Elvis", position: "MF", rating: 70 },
    { name: "Jeh", position: "FW", rating: 71 }
  ] },
  { id: 'sao_bernardo', name: 'Sao Bernardo', division: 'B', primaryColor: '#FFC107', secondaryColor: '#1B5E20', textColor: '#000000', stadiumCapacity: 12000, stadiumName: 'Primeiro de Maio', reputation: 64, stars: [
    { name: "Alex Alves", position: "GK", rating: 66 },
    { name: "Lucas Lima", position: "DF", rating: 65 },
    { name: "Silvinho", position: "FW", rating: 67 }
  ] },
  { id: 'sport', name: 'Sport Recife', division: 'B', primaryColor: '#C62828', secondaryColor: '#E65100', textColor: '#FFFFFF', stadiumCapacity: 32000, stadiumName: 'Ilha do Retiro', reputation: 76, stars: [
    { name: "Caíque França", position: "GK", rating: 74 },
    { name: "Rafael Thyere", position: "DF", rating: 73 },
    { name: "Lucas Lima", position: "MF", rating: 75 },
    { name: "Gustavo Coutinho", position: "FW", rating: 74 }
  ] },
  { id: 'vila_nova', name: 'Vila Nova', division: 'B', primaryColor: '#C62828', secondaryColor: '#FFFFFF', textColor: '#FFFFFF', stadiumCapacity: 11000, stadiumName: 'OBA', reputation: 68, stars: [
    { name: "Dênis Júnior", position: "GK", rating: 70 },
    { name: "Ralf", position: "MF", rating: 69 },
    { name: "Alesson", position: "FW", rating: 71 }
  ] },

  // --- SERIE C ---
  { id: 'amazonas', name: 'Amazonas FC', division: 'C', primaryColor: '#FBC02D', secondaryColor: '#111111', textColor: '#000000', stadiumCapacity: 44000, stadiumName: 'Arena da Amazonia', reputation: 62, stars: [
    { name: "Marcão", position: "GK", rating: 65 },
    { name: "Sassá", position: "FW", rating: 67 },
    { name: "Diego Torres", position: "MF", rating: 66 }
  ] },
  { id: 'anapolis', name: 'Anapolis', division: 'C', primaryColor: '#1976D2', secondaryColor: '#FFFFFF', textColor: '#FFFFFF', stadiumCapacity: 10000, stadiumName: 'Jonas Duarte', reputation: 50, stars: [
    { name: "Marcão", position: "DF", rating: 55 },
    { name: "Gonzalo", position: "FW", rating: 57 }
  ] },
  { id: 'barra_sc', name: 'Barra-SC', division: 'C', primaryColor: '#0288D1', secondaryColor: '#FBC02D', textColor: '#FFFFFF', stadiumCapacity: 5000, stadiumName: 'Arena Barra', reputation: 48, stars: [
    { name: "Ewerton", position: "GK", rating: 52 },
    { name: "Adilson", position: "FW", rating: 54 }
  ] },
  { id: 'botafogo_pb', name: 'Botafogo-PB', division: 'C', primaryColor: '#111111', secondaryColor: '#FFFFFF', textColor: '#FFFFFF', stadiumCapacity: 25000, stadiumName: 'Almeidao', reputation: 55, stars: [
    { name: "Wallace", position: "GK", rating: 60 },
    { name: "Pipico", position: "FW", rating: 61 }
  ] },
  { id: 'brusque', name: 'Brusque', division: 'C', primaryColor: '#FBC02D', secondaryColor: '#D32F2F', textColor: '#FFFFFF', stadiumCapacity: 6000, stadiumName: 'Augusto Bauer', reputation: 58, stars: [
    { name: "Matheus Nogueira", position: "GK", rating: 62 },
    { name: "Wallace", position: "DF", rating: 60 },
    { name: "Rodolfo Potiguar", position: "MF", rating: 60 }
  ] },
  { id: 'caxias', name: 'Caxias', division: 'C', primaryColor: '#880E4F', secondaryColor: '#0D47A1', textColor: '#FFFFFF', stadiumCapacity: 22000, stadiumName: 'Centenario', reputation: 56, stars: [
    { name: "Dirceu", position: "DF", rating: 59 },
    { name: "Tomas Bastos", position: "MF", rating: 60 }
  ] },
  { id: 'confianca', name: 'Confianca', division: 'C', primaryColor: '#0D47A1', secondaryColor: '#FFFFFF', textColor: '#FFFFFF', stadiumCapacity: 15000, stadiumName: 'Batistao', reputation: 54, stars: [
    { name: "Jeferson Souza", position: "GK", rating: 58 },
    { name: "Willians Santana", position: "FW", rating: 59 }
  ] },
  { id: 'ferroviaria', name: 'Ferroviaria', division: 'C', primaryColor: '#4A148C', secondaryColor: '#FFFFFF', textColor: '#FFFFFF', stadiumCapacity: 20000, stadiumName: 'Fonte Luminosa', reputation: 59, stars: [
    { name: "Saulo", position: "GK", rating: 62 },
    { name: "Ronaldo Alves", position: "DF", rating: 61 },
    { name: "Carlão", position: "FW", rating: 62 }
  ] },
  { id: 'figueirense', name: 'Figueirense', division: 'C', primaryColor: '#111111', secondaryColor: '#FFFFFF', textColor: '#FFFFFF', stadiumCapacity: 19800, stadiumName: 'Orlando Scarpelli', reputation: 62, stars: [
    { name: "Thiago Gonçalves", position: "GK", rating: 64 },
    { name: "Genilson", position: "DF", rating: 62 },
    { name: "Camilo", position: "MF", rating: 65 }
  ] },
  { id: 'floresta', name: 'Floresta', division: 'C', primaryColor: '#1B5E20', secondaryColor: '#FFFFFF', textColor: '#FFFFFF', stadiumCapacity: 5000, stadiumName: 'Presidente Vargas', reputation: 46, stars: [
    { name: "Igor Campos", position: "DF", rating: 51 },
    { name: "Buba", position: "FW", rating: 53 }
  ] },
  { id: 'guarani', name: 'Guarani', division: 'C', primaryColor: '#1B5E20', secondaryColor: '#FFFFFF', textColor: '#FFFFFF', stadiumCapacity: 29000, stadiumName: 'Brinco de Ouro', reputation: 64, stars: [
    { name: "Douglas Borges", position: "GK", rating: 66 },
    { name: "Léo Santos", position: "DF", rating: 65 },
    { name: "Chay", position: "MF", rating: 67 },
    { name: "Luccas Paraizo", position: "FW", rating: 66 }
  ] },
  { id: 'inter_limeira', name: 'Inter de Limeira', division: 'C', primaryColor: '#111111', secondaryColor: '#FFFFFF', textColor: '#FFFFFF', stadiumCapacity: 13000, stadiumName: 'Limeirao', reputation: 52, stars: [
    { name: "André Luiz", position: "GK", rating: 56 },
    { name: "Diego Jussani", position: "DF", rating: 58 }
  ] },
  { id: 'itabaiana', name: 'Itabaiana', division: 'C', primaryColor: '#0D47A1', secondaryColor: '#D32F2F', textColor: '#FFFFFF', stadiumCapacity: 6000, stadiumName: 'Mendonçao', reputation: 48, stars: [
    { name: "Jefferson", position: "GK", rating: 52 },
    { name: "Tiago Souza", position: "FW", rating: 54 }
  ] },
  { id: 'ituano', name: 'Ituano', division: 'C', primaryColor: '#C62828', secondaryColor: '#111111', textColor: '#FFFFFF', stadiumCapacity: 18000, stadiumName: 'Novelli Junior', reputation: 60, stars: [
    { name: "Jefferson Paulino", position: "GK", rating: 64 },
    { name: "Claudinho", position: "DF", rating: 61 },
    { name: "José Aldo", position: "MF", rating: 63 }
  ] },
  { id: 'maranhao', name: 'Maranhao', division: 'C', primaryColor: '#0D47A1', secondaryColor: '#D32F2F', textColor: '#FFFFFF', stadiumCapacity: 40000, stadiumName: 'Castelao-MA', reputation: 49, stars: [
    { name: "Moises", position: "GK", rating: 53 },
    { name: "Ronald", position: "FW", rating: 55 }
  ] },
  { id: 'maringa', name: 'Maringa', division: 'C', primaryColor: '#111111', secondaryColor: '#00E676', textColor: '#FFFFFF', stadiumCapacity: 16000, stadiumName: 'Willie Davids', reputation: 57, stars: [
    { name: "Dheimison", position: "GK", rating: 62 },
    { name: "Tito", position: "DF", rating: 60 },
    { name: "Rodrigo", position: "MF", rating: 61 }
  ] },
  { id: 'paysandu', name: 'Paysandu', division: 'C', primaryColor: '#03A9F4', secondaryColor: '#FFFFFF', textColor: '#FFFFFF', stadiumCapacity: 16000, stadiumName: 'Curuzu', reputation: 65, stars: [
    { name: "Matheus Nogueira", position: "GK", rating: 67 },
    { name: "Lucas Maia", position: "DF", rating: 66 },
    { name: "Robinho", position: "MF", rating: 67 },
    { name: "Nicolas", position: "FW", rating: 68 }
  ] },
  { id: 'santa_cruz', name: 'Santa Cruz', division: 'C', primaryColor: '#C62828', secondaryColor: '#111111', textColor: '#FFFFFF', stadiumCapacity: 60000, stadiumName: 'Arruda', reputation: 66, stars: [
    { name: "Matheus Melo", position: "MF", rating: 67 },
    { name: "Gilvan", position: "DF", rating: 65 },
    { name: "Thiago Henrique", position: "FW", rating: 66 }
  ] },
  { id: 'volta_redonda', name: 'Volta Redonda', division: 'C', primaryColor: '#FFC107', secondaryColor: '#111111', textColor: '#000000', stadiumCapacity: 20000, stadiumName: 'Raulino de Oliveira', reputation: 58, stars: [
    { name: "Jean Drosny", position: "GK", rating: 62 },
    { name: "Bruno Barra", position: "MF", rating: 61 },
    { name: "MV", position: "FW", rating: 63 }
  ] },
  { id: 'ypiranga_rs', name: 'Ypiranga-RS', division: 'C', primaryColor: '#FFEB3B', secondaryColor: '#1B5E20', textColor: '#000000', stadiumCapacity: 8000, stadiumName: 'Colosso da Lagoa', reputation: 55, stars: [
    { name: "Alexander", position: "GK", rating: 60 },
    { name: "Heitor", position: "DF", rating: 59 },
    { name: "Alisson Farias", position: "MF", rating: 61 }
  ] }
];

const randomRange = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

const calculatePlayerValueAndSalary = (rating: number, age: number, position: string) => {
  const ageFactor = age < 24 ? 1.3 : age > 30 ? 0.7 : 1.0;
  const positionFactor = position === 'FW' ? 1.2 : position === 'GK' ? 0.9 : 1.0;
  const ratingBase = Math.pow(rating - 30, 2.5) * 800;
  const value = Math.max(10000, Math.round(ratingBase * ageFactor * positionFactor));
  const salary = Math.round(value * 0.005);
  return { value, salary };
};

export const generateSquad = (clubId: string, division: 'A' | 'B' | 'C', stars: { name: string; position: 'GK' | 'DF' | 'MF' | 'FW'; rating: number }[] = []): Player[] => {
  const squad: Player[] = [];
  let idCounter = 1;

  let minRating = division === 'A' ? 75 : division === 'B' ? 65 : 53;
  let maxRating = division === 'A' ? 83 : division === 'B' ? 74 : 64;

  const usedPositions: Record<'GK' | 'DF' | 'MF' | 'FW', number> = { GK: 0, DF: 0, MF: 0, FW: 0 };
  
  stars.forEach(star => {
    const age = randomRange(19, 34);
    const { value, salary } = calculatePlayerValueAndSalary(star.rating, age, star.position);
    squad.push({
      id: `${clubId}_p_${idCounter++}`,
      name: star.name,
      age,
      position: star.position,
      rating: star.rating,
      energy: 100,
      value,
      salary,
      goals: 0,
      yellowCards: 0,
      redCards: 0,
      isInjured: false,
      isStar: star.rating >= 80,
      contractLocked: star.rating >= 83
    });
    usedPositions[star.position]++;
  });

  const positionTargets = { GK: 2, DF: 6, MF: 6, FW: 4 };

  (Object.keys(positionTargets) as ('GK' | 'DF' | 'MF' | 'FW')[]).forEach(pos => {
    const target = positionTargets[pos];
    const current = usedPositions[pos];
    
    for (let i = current; i < target; i++) {
      let firstName = FIRST_NAMES[randomRange(0, FIRST_NAMES.length - 1)];
      let lastName = LAST_NAMES[randomRange(0, LAST_NAMES.length - 1)];
      let name = `${firstName} ${lastName}`;
      
      while (squad.some(p => p.name === name)) {
        firstName = FIRST_NAMES[randomRange(0, FIRST_NAMES.length - 1)];
        lastName = LAST_NAMES[randomRange(0, LAST_NAMES.length - 1)];
        name = `${firstName} ${lastName}`;
      }

      const age = randomRange(18, 35);
      const rating = randomRange(minRating, maxRating);
      const { value, salary } = calculatePlayerValueAndSalary(rating, age, pos);

      squad.push({
        id: `${clubId}_p_${idCounter++}`,
        name,
        age,
        position: pos,
        rating,
        energy: 100,
        value,
        salary,
        goals: 0,
        yellowCards: 0,
        redCards: 0,
        isInjured: false,
        isStar: false,
        contractLocked: rating >= 83
      });
    }
  });

  const posOrder = { GK: 0, DF: 1, MF: 2, FW: 3 };
  return squad.sort((a, b) => {
    if (posOrder[a.position] !== posOrder[b.position]) {
      return posOrder[a.position] - posOrder[b.position];
    }
    return b.rating - a.rating;
  });
};

export const initializeClubs = (): Club[] => {
  return CLUB_DEFINITIONS.map(def => {
    const squad = generateSquad(def.id, def.division, def.stars);
    const tvMoney = def.division === 'A' ? 8000000 : def.division === 'B' ? 2000000 : 500000;
    const finances = Math.round(def.reputation * def.reputation * 3000) + tvMoney;
    return {
      id: def.id,
      name: def.name,
      division: def.division,
      primaryColor: def.primaryColor,
      secondaryColor: def.secondaryColor,
      textColor: def.textColor,
      stadiumCapacity: def.stadiumCapacity,
      stadiumName: def.stadiumName,
      ticketPrice: def.division === 'A' ? 50 : def.division === 'B' ? 35 : 25,
      finances,
      confidence: 70,
      reputation: def.reputation,
      isPlayerClub: false,
      squad
    };
  });
};

export const formatCurrency = (value: number): string => {
  if (value >= 1000000) {
    const val = value / 1000000;
    return `R$ ${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)} M`;
  }
  if (value >= 1000) {
    const val = value / 1000;
    return `R$ ${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)} K`;
  }
  return `R$ ${value}`;
};
