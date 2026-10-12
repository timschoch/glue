import {
  findBuilds,
  findConcept,
  findContractState,
  findProject,
  measured,
  parts,
  projects,
} from '../src/prototype/concept-document/seed.ts'
import { createMemoryServer } from '../src/test/server.ts'

// PROTOTYPE, throwaway (design-system/D16). The memory server with the seed
// of the Concept document prototype. `pnpm prototype` starts the app with it.
export const server = createMemoryServer({
  fetchProjects: () => Promise.resolve(projects),
  fetchProject: (project) => Promise.resolve(findProject(project)),
  fetchConcept: (concept) => Promise.resolve(findConcept(concept)),
  fetchParts: () => Promise.resolve(parts),
  fetchMeasured: () => Promise.resolve(measured),
  fetchContractState: (concept) => Promise.resolve(findContractState(concept)),
  fetchBuilds: (_project, named) =>
    Promise.resolve(
      findBuilds(named && 'concept' in named ? named.concept : undefined),
    ),
})
