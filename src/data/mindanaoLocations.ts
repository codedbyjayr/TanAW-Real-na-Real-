import { LocationPin, CategoryType } from '../types/accessibility';

/** Publicly listed venues across Mindanao. Pins identify venue locations only;
 * accessibility has not been assessed and each starts unrated. */
const venues: Array<{
  id: string;
  googlePlaceId?: string;
  name: string;
  category: CategoryType;
  address: string;
  lat: number;
  lng: number;
}> = [
  { id: 'dvo-sm-lanang', googlePlaceId: 'ChIJ50c3H6R1-TIRvK5f6y9Y6i8', name: 'SM Lanang', category: 'Shopping', address: 'J.P. Laurel Avenue, Lanang, Davao City', lat: 7.0988, lng: 125.6311 },
  { id: 'dvo-sm-ecoland', googlePlaceId: 'ChIJT5M53rxs-TIR5jN-9g7c9d4', name: 'SM City Davao (Ecoland)', category: 'Shopping', address: 'Quimpo Boulevard, Matina, Davao City', lat: 7.0492, lng: 125.5883 },
  { id: 'dvo-peoples-park', googlePlaceId: 'ChIJW8m07M1s-TIR2p5q7s9w2g0', name: "People's Park", category: 'Public Space', address: 'Palma Gil Street, Davao City', lat: 7.0684, lng: 125.6087 },
  { id: 'dvo-ddh', googlePlaceId: 'ChIJK7v24M5s-TIR8n9r6t1y3h2', name: 'Davao Doctors Hospital', category: 'Healthcare', address: '118 E. Quirino Avenue, Davao City', lat: 7.0669, lng: 125.6098 },
  { id: 'dvo-spmc', googlePlaceId: 'ChIJQ4n82K51-TIR6m3p1v5z9j4', name: 'Southern Philippines Medical Center', category: 'Healthcare', address: 'J.P. Laurel Avenue, Davao City', lat: 7.0992, lng: 125.6128 },
  { id: 'dvo-magsaysay-park', name: 'Magsaysay Park', category: 'Public Space', address: 'Magsaysay Avenue, Davao City', lat: 7.0720, lng: 125.6170 },
  { id: 'dvo-lachi', name: "Lachi's Sans Rival Atbp.", category: 'Dining & Cafe', address: 'F. Torres Street, Davao City', lat: 7.0740, lng: 125.6120 },
  { id: 'gensan-sm', googlePlaceId: 'ChIJ2b6c8d9e-DIR4k7l2m3n5p6', name: 'SM City General Santos', category: 'Shopping', address: 'Santiago Boulevard, General Santos City', lat: 6.1127, lng: 125.1748 },
  { id: 'gensan-kcc', name: 'KCC Mall of GenSan', category: 'Shopping', address: 'J. Catolico Avenue, General Santos City', lat: 6.1210, lng: 125.1740 },
  { id: 'gensan-queen-tuna', name: 'Queen Tuna Park', category: 'Public Space', address: 'Jose Catolico Sr. Avenue, General Santos City', lat: 6.1086, lng: 125.1718 },
  { id: 'gensan-dadiangas-medical', name: 'Dadiangas Medical Center', category: 'Healthcare', address: 'National Highway, General Santos City', lat: 6.1120, lng: 125.1750 },
  { id: 'gensan-tuna-grill', name: 'Tambilawan Kamayan Restaurant', category: 'Dining & Cafe', address: 'General Santos City', lat: 6.1150, lng: 125.1730 },
  { id: 'butuan-sm', name: 'SM City Butuan', category: 'Shopping', address: 'JC Aquino Avenue, Butuan City', lat: 8.9530, lng: 125.5350 },
  { id: 'butuan-city-hall', name: 'Butuan City Hall / Guingona Park', category: 'Public Space', address: 'J.C. Aquino Avenue, Butuan City', lat: 8.9475, lng: 125.5430 },
  { id: 'butuan-mcu', name: 'Butuan Medical Center', category: 'Healthcare', address: 'J. Rosales Avenue, Butuan City', lat: 8.9520, lng: 125.5350 },
  { id: 'butuan-cafe', name: 'Margie’s Kitchen', category: 'Dining & Cafe', address: 'Montilla Boulevard, Butuan City', lat: 8.9490, lng: 125.5400 },
  { id: 'zambo-sm-mindpro', name: 'SM City Mindpro', category: 'Shopping', address: 'La Purisima Street, Zamboanga City', lat: 6.9125, lng: 122.0790 },
  { id: 'zambo-paseo', name: 'Paseo del Mar', category: 'Public Space', address: 'Valderrosa Street, Zamboanga City', lat: 6.9010, lng: 122.0765 },
  { id: 'zambo-zamboanga-medical', name: 'Zamboanga City Medical Center', category: 'Healthcare', address: 'General Vicente Alvarez Street, Zamboanga City', lat: 6.9140, lng: 122.0780 },
  { id: 'zambo-alavar', name: 'Alavar Seafood Restaurant', category: 'Dining & Cafe', address: 'Don Alfaro Street, Zamboanga City', lat: 6.9160, lng: 122.0790 },
  { id: 'cotabato-citymall', name: 'CityMall Cotabato', category: 'Shopping', address: 'Quezon Avenue, Cotabato City', lat: 7.2160, lng: 124.2490 },
  { id: 'cotabato-old-city-hall', name: 'Cotabato City Plaza', category: 'Public Space', address: 'Sinsuat Avenue, Cotabato City', lat: 7.2220, lng: 124.2450 },
  { id: 'iligan-rob', name: 'Robinsons Place Iligan', category: 'Shopping', address: 'Macapagal Avenue, Iligan City', lat: 8.2280, lng: 124.2450 },
  { id: 'iligan-maria-cristina', name: 'Maria Cristina Falls Viewpoint', category: 'Public Space', address: 'NPC Nature Park, Iligan City', lat: 8.1610, lng: 124.2030 },
  { id: 'iligan-medical', name: 'Adventist Medical Center Iligan', category: 'Healthcare', address: 'Quezon Avenue, Iligan City', lat: 8.2290, lng: 124.2450 },
  { id: 'pagadian-gaisano', name: 'Gaisano Capital Pagadian', category: 'Shopping', address: 'Rizal Avenue, Pagadian City', lat: 7.8260, lng: 123.4370 },
];

export const MINDANAO_LOCATIONS: LocationPin[] = venues.map((venue) => ({
  ...venue,
  source: venue.googlePlaceId ? 'google' : 'custom',
  averageRating: 0,
  totalReviews: 0,
  tags: [],
  photos: [],
  reviews: [],
  description: 'Public venue listing. Accessibility information has not yet been community verified.',
  createdAt: '2026-11-08T00:00:00Z',
  updatedAt: '2026-11-08T00:00:00Z',
}));
