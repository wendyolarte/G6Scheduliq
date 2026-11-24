const INSTRUCTORS = [
  {
    name: 'Richard Estrada',
    course: 'Introduction to Computing',
    equipment: ['Computers', 'Projector', 'Whiteboard', 'Internet Access']
  },
  {
    name: 'Ralph Inigo Baguio',
    course: 'Computer Programming 1',
    equipment: ['Computers', 'Projector', 'Whiteboard', 'Internet Access']
  },
  {
    name: 'Jhora Samm Genon',
    course: 'Purposive Communication',
    equipment: ['Projector', 'Whiteboard', 'Sound System', 'Microphone']
  },
  {
    name: 'Jose Vicente Cuevas',
    course: 'The Contemporary World',
    equipment: ['Projector', 'Whiteboard', 'Sound System', 'Internet Access']
  },
  {
    name: 'Mrs. Jacquiline Y. Galupo',
    course: 'Readings in Philippine History',
    equipment: ['Projector', 'Whiteboard', 'Document Camera']
  },
  {
    name: 'Mr. Noel G. Cuarteros Jr.',
    course: 'Mathematics in a Modern World',
    equipment: ['Projector', 'Whiteboard', 'Scientific Calculators']
  },
  {
    name: 'Dwight Esquerdo',
    course: 'Movement Enhancement',
    equipment: ['Exercise Mats', 'Portable Speaker', 'First Aid Kit']
  },
  {
    name: 'Mrs. Marife M. Alfeche',
    course: 'Civic Welfare Training Service',
    equipment: ['First Aid Kit', 'Portable Speaker', 'Cleanup Kit', 'Projector']
  }
];

const normalize = value => String(value || '').trim().toLocaleLowerCase();
const getDefaultInstructor = courseName =>
  INSTRUCTORS.find(instructor => normalize(instructor.course) === normalize(courseName)) || null;
const isDirectoryInstructor = name =>
  INSTRUCTORS.some(instructor => normalize(instructor.name) === normalize(name));

module.exports = { INSTRUCTORS, getDefaultInstructor, isDirectoryInstructor };
